// Template engine — substitution, validation, bulk rendering, AI generation.
//
// A MessageTemplate has:
//   - body / smsBody / emailSubject / emailHtml (channel-specific)
//   - variables (JSON array of {{token}} names used)
//
// The engine:
//   1. Validates the template (balanced braces, declared vars, channel rules)
//   2. Extracts all {{tokens}} from the body
//   3. Substitutes from a template context (lib/template-context.ts)
//   4. Validates that no unresolved tokens remain
//   5. Renders for a single customer OR bulk
//   6. Tracks usage (timesUsed, lastUsedAt)
//
// Token resolution:
//   - {{name}}, {{phone}}, {{email}}              (top-level)
//   - {{customer.name}}, {{customer.lastVisitAt}} (namespaced)
//   - {{business.name}}, {{business.city}}        (namespaced)
//   - {{appointment.date}}, {{appointment.time}}  (if appointment context)
//   - {{custom.<key>}}                            (custom field values)

import { prisma } from '@/lib/db'
import { buildTemplateContext } from './template-context'
import { fillTemplate } from './template-engine'
import { guardedAICustom } from './ai-guard'

export type TemplateChannel = 'whatsapp' | 'sms' | 'email'

export interface Template {
  id: string
  businessId: string
  name: string
  description: string | null
  channel: TemplateChannel
  category: 'marketing' | 'transactional' | 'system'
  body: string | null
  metaTemplateName: string | null
  smsBody: string | null
  emailSubject: string | null
  emailHtml: string | null
  emailText: string | null
  variables: string[]   // declared vars (parsed)
  metaTemplateConfig: {
    name?: string
    language?: string
    paramOrder?: string[]
  } | null
  status: 'active' | 'archived' | 'draft'
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

/** Extract every {{token}} referenced in a piece of text. */
export function extractTokens(text: string | null | undefined): string[] {
  if (!text) return []
  const out = new Set<string>()
  for (const m of text.matchAll(TOKEN_RE)) {
    const key = m[1]
    if (!/^\d+$/.test(key)) out.add(key)
  }
  return [...out]
}

/** Per-channel constraints. */
export function validateTemplate(t: Partial<Template>): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!t.name?.trim()) errors.push('Name is required')
  if (!t.channel || !['whatsapp', 'sms', 'email'].includes(t.channel)) {
    errors.push('Channel must be whatsapp, sms, or email')
  }
  if (t.channel === 'whatsapp') {
    if (!t.body?.trim() && !t.metaTemplateName) {
      errors.push('WhatsApp template needs body or Meta template name')
    }
    if (t.body && t.body.length > 4096) {
      errors.push('WhatsApp body too long (max 4096 chars)')
    }
  }
  if (t.channel === 'sms') {
    if (!t.smsBody?.trim()) errors.push('SMS template needs a body')
    if (t.smsBody && t.smsBody.length > 1600) {
      errors.push('SMS body too long (max 1600 chars / 10 segments)')
    }
  }
  if (t.channel === 'email') {
    if (!t.emailSubject?.trim()) errors.push('Email template needs a subject')
    if (!t.emailHtml?.trim()) errors.push('Email template needs HTML body')
    if (t.emailSubject && t.emailSubject.length > 200) {
      errors.push('Email subject too long (max 200 chars)')
    }
  }
  // Variables are informational; runtime resolution is what matters
  return { valid: errors.length === 0, errors }
}

// ============================================================
// RENDERING
// ============================================================

export interface RenderedTemplate {
  /** WhatsApp: body text. SMS: body text. */
  body?: string
  /** WhatsApp Meta template name + params, if template is Meta-approved. */
  metaTemplate?: { name: string; language: string; params: string[] }
  /** Email: subject + html + text */
  emailSubject?: string
  emailHtml?: string
  emailText?: string
  /** SMS-only */
  smsBody?: string
  /** Any tokens that couldn't be resolved (empty if all good) */
  unresolved: string[]
  /** All tokens referenced (for debugging) */
  tokens: string[]
}

/**
 * Render a template for one customer using the unified template context
 * builder (lib/template-context.ts). Returns the channel-specific output
 * plus diagnostics about unresolved tokens.
 */
export async function renderTemplateForCustomer(
  template: Template,
  customerId: string,
  appointmentId?: string
): Promise<RenderedTemplate> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { customFieldValues: { include: { field: true } } },
  })
  if (!customer) throw new Error('Customer not found')

  const business = await prisma.business.findUnique({
    where: { id: template.businessId },
    select: { name: true, ownerName: true, city: true, language: true, currency: true },
  })
  if (!business) throw new Error('Business not found')

  const customFieldDefs = await prisma.customField.findMany({
    where: { businessId: template.businessId, active: true },
  })

  let appointment = undefined
  if (appointmentId) {
    const a = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: { select: { name: true, durationMin: true } } },
    })
    if (a) {
      appointment = {
        startsAt: a.startsAt,
        service: a.service ? { name: a.service.name, durationMin: a.service.durationMin } : null,
      }
    }
  }

  const ctx = buildTemplateContext({
    customer: { ...customer, customFieldValues: customer.customFieldValues || [] },
    business,
    appointment: appointment || null,
    customFieldDefs,
  })

  return renderTemplateWithContext(template, ctx)
}

/** Render with a pre-built context (used by bulk renders). */
export function renderTemplateWithContext(
  template: Template,
  ctx: Record<string, string>
): RenderedTemplate {
  const tokensAll = new Set<string>()
  const unresolved = new Set<string>()

  const resolve = (text: string | null | undefined): string | undefined => {
    if (!text) return undefined
    const tokens = extractTokens(text)
    tokens.forEach((t) => tokensAll.add(t))
    // Pre-fill missing values with empty string so unsubstituted tokens
    // show up as blanks rather than crashing. Then detect them below.
    const paddedCtx: Record<string, string> = { ...ctx }
    for (const t of tokens) {
      if (!(t in paddedCtx)) {
        paddedCtx[t] = ''
        unresolved.add(t)
      }
    }
    return fillTemplate(text, paddedCtx)
  }

  const out: RenderedTemplate = { unresolved: [], tokens: [] }

  if (template.channel === 'whatsapp') {
    if (template.metaTemplateName && template.metaTemplateConfig) {
      // Meta-approved template — render params in declared order
      const paramOrder = template.metaTemplateConfig.paramOrder || []
      const params: string[] = paramOrder.map((ref) => {
        // Try direct match, then customer.X, then business.X
        const val =
          ctx[ref] ||
          ctx[`customer.${ref}`] ||
          ctx[`business.${ref}`] ||
          ctx[ref.replace(/^customer\./, '').replace(/^business\./, '')] ||
          ''
        tokensAll.add(ref)
        if (!val) unresolved.add(ref)
        return val
      })
      out.metaTemplate = {
        name: template.metaTemplateName,
        language: template.metaTemplateConfig.language || 'en',
        params,
      }
    } else if (template.body) {
      out.body = resolve(template.body)
    }
  } else if (template.channel === 'sms') {
    if (template.smsBody) {
      out.smsBody = resolve(template.smsBody)
    }
  } else if (template.channel === 'email') {
    if (template.emailSubject) out.emailSubject = resolve(template.emailSubject)
    if (template.emailHtml) out.emailHtml = resolve(template.emailHtml)
    if (template.emailText) out.emailText = resolve(template.emailText)
  }

  out.tokens = [...tokensAll]
  out.unresolved = [...unresolved]
  return out
}

// ============================================================
// BULK RENDER + SEND
// ============================================================

export interface BulkRenderOptions {
  template: Template
  customerIds: string[]
  businessId: string
  /** Optional appointmentId to inject into context for each customer. */
  appointmentId?: string
  /** Bounded concurrency for the DB lookups. */
  concurrency?: number
  /** Skip customers with unresolved tokens (default true). */
  skipUnresolved?: boolean
}

export interface BulkRenderResult {
  total: number
  rendered: number
  skipped: number
  errors: number
  items: Array<{
    customerId: string
    rendered: RenderedTemplate
    ok: boolean
    error?: string
  }>
}

/**
 * Render a template for many customers in one call. Uses bounded
 * concurrency to avoid hammering the DB on a 10k-customer list.
 */
export async function bulkRenderTemplate(opts: BulkRenderOptions): Promise<BulkRenderResult> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 10, 50))
  const skipUnresolved = opts.skipUnresolved ?? true

  // Pre-fetch business + custom field defs once
  const [business, customFieldDefs] = await Promise.all([
    prisma.business.findUnique({
      where: { id: opts.businessId },
      select: { name: true, ownerName: true, city: true, language: true, currency: true },
    }),
    prisma.customField.findMany({ where: { businessId: opts.businessId, active: true } }),
  ])
  if (!business) throw new Error('Business not found')
  const businessForCtx: { name: string; ownerName: string; city: string; language: string; currency: string } = business

  const result: BulkRenderResult = {
    total: opts.customerIds.length,
    rendered: 0,
    skipped: 0,
    errors: 0,
    items: [],
  }

  let cursor = 0
  async function worker() {
    while (cursor < opts.customerIds.length) {
      const idx = cursor++
      const cid = opts.customerIds[idx]
      try {
        const customer = await prisma.customer.findUnique({
          where: { id: cid },
          include: { customFieldValues: { include: { field: true } } },
        })
        if (!customer || customer.optedOut) {
          result.skipped++
          result.items.push({ customerId: cid, rendered: { unresolved: [], tokens: [] }, ok: false, error: 'not_found_or_opted_out' })
          continue
        }
        const ctx = buildTemplateContext({
          customer: { ...customer, customFieldValues: customer.customFieldValues || [] },
          business: businessForCtx,
          customFieldDefs,
        })
        const rendered = renderTemplateWithContext(opts.template, ctx)
        if (skipUnresolved && rendered.unresolved.length > 0) {
          result.skipped++
          result.items.push({ customerId: cid, rendered, ok: false, error: `unresolved: ${rendered.unresolved.join(',')}` })
        } else {
          result.rendered++
          result.items.push({ customerId: cid, rendered, ok: true })
        }
      } catch (err: any) {
        result.errors++
        result.items.push({ customerId: cid, rendered: { unresolved: [], tokens: [] }, ok: false, error: err.message })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return result
}

// ============================================================
// AI TEMPLATE GENERATION
// ============================================================

export interface GenerateTemplateInput {
  businessId: string
  channel: TemplateChannel
  category: 'marketing' | 'transactional' | 'system'
  /** What the template is for. AI uses this to write the right copy. */
  purpose: string
  /** Optional target audience hint (e.g. "VIP customers", "inactive 90+ days"). */
  audience?: string
  /** Optional tone: warm/professional/urgent/casual */
  tone?: 'warm' | 'professional' | 'urgent' | 'casual'
  /** Optional language preference (default business.language) */
  language?: string
}

export interface GeneratedTemplate {
  name: string
  description: string
  body: string | null
  smsBody: string | null
  emailSubject: string | null
  emailHtml: string | null
  variables: string[]
}

/**
 * AI-generate a template body for the given channel + purpose.
 * Uses the AI guard (cost-controlled) and the business's vertical
 * + language to make the copy on-brand.
 */
export async function generateTemplateWithAI(
  input: GenerateTemplateInput
): Promise<GeneratedTemplate> {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { name: true, vertical: true, city: true, ownerName: true, language: true },
  })
  if (!business) throw new Error('Business not found')

  const lang = input.language || business.language || 'hinglish'
  const tone = input.tone || 'warm'

  // System prompt — channel-aware
  const channelRules: Record<TemplateChannel, string> = {
    whatsapp: 'Max 600 characters. Use Hinglish naturally. End with a clear CTA (reply YES, call, book). Use 1-2 emojis max.',
    sms: 'Max 160 characters (single SMS segment). Even shorter is better — every character costs money. One CTA. No emojis unless they add value.',
    email: 'Subject line under 60 chars (gets cut off in inbox). HTML body with proper structure (h2, p, strong). One clear CTA button. Footer with unsubscribe-style link is OK.',
  }
  const variablesHint = `
Available variables (substituted at send time):
  {{name}} - customer's first name
  {{customer.name}}, {{customer.phone}}, {{customer.email}}
  {{customer.lastVisitAt}} - formatted date, e.g. "15 Jan 2025"
  {{customer.totalVisits}} - number
  {{customer.birthday}}, {{customer.anniversary}} - formatted dates
  {{business.name}} - business name
  {{business.city}}, {{business.ownerName}} - location and owner
  {{appointment.date}}, {{appointment.time}} - if the message is about a specific booking
  {{custom.<key>}} - any custom field defined for this business

ALWAYS use {{tokens}} for values that vary per customer. Use literal text only for the parts that don't change.`

  const systemPrompt = `You are a marketing copywriter for ${business.name}, a ${business.vertical} business in ${business.city || 'India'}.
The owner's name is ${business.ownerName}. You write in ${lang} (use Devanagari for Hindi, English for technical terms).
Tone: ${tone}.

${channelRules[input.channel]}

${variablesHint}

Return ONLY a valid JSON object with these fields:
{
  "name": "short internal name, 2-5 words",
  "description": "what this template is for, 1 sentence",
  ${input.channel === 'whatsapp' ? '"body": "the WhatsApp message with {{tokens}}",' : ''}
  ${input.channel === 'sms' ? '"body": "the SMS message with {{tokens}}",' : ''}
  ${input.channel === 'email' ? '"emailSubject": "subject line", "emailHtml": "HTML body with {{tokens}}",' : ''}
  "variables": ["array", "of", "all", "tokens", "used"]
}`

  const userMessage = `Write a ${input.channel} template for: ${input.purpose}
${input.audience ? `Target audience: ${input.audience}` : ''}

Return valid JSON only. No markdown. No explanation.`

  const result = await guardedAICustom(input.businessId, systemPrompt, userMessage, {
    cacheTtl: 300, // 5 min cache — same prompt = same template
  })

  if (!result.text) {
    // AI budget exceeded or failed — return a sensible default structure
    return {
      name: input.purpose.slice(0, 50),
      description: input.purpose,
      body: input.channel === 'whatsapp' || input.channel === 'sms'
        ? `🙏 नमस्ते {{name}}! ${input.purpose}.`
        : null,
      smsBody: input.channel === 'sms' ? `Namaste {{name}}, ${input.purpose}.` : null,
      emailSubject: input.channel === 'email' ? input.purpose : null,
      emailHtml: input.channel === 'email'
        ? `<h2>नमस्ते {{name}}!</h2><p>${input.purpose}</p>`
        : null,
      variables: ['name'],
    }
  }

  // Parse the AI response (it should be JSON)
  let parsed: any
  try {
    // Strip any markdown code fences the AI may have added
    const cleaned = result.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    // Fallback: treat the whole text as the body
    parsed = {
      name: input.purpose.slice(0, 50),
      description: input.purpose,
      body: input.channel !== 'email' ? result.text : null,
      emailSubject: input.channel === 'email' ? input.purpose : null,
      emailHtml: input.channel === 'email' ? result.text : null,
      variables: extractTokens(result.text),
    }
  }

  // Map to channel-specific shape
  const out: GeneratedTemplate = {
    name: parsed.name || input.purpose.slice(0, 50),
    description: parsed.description || input.purpose,
    body: null,
    smsBody: null,
    emailSubject: null,
    emailHtml: null,
    variables: parsed.variables || extractTokens(parsed.body || parsed.smsBody || parsed.emailHtml || ''),
  }
  if (input.channel === 'whatsapp') out.body = parsed.body || null
  if (input.channel === 'sms') out.smsBody = parsed.body || parsed.smsBody || null
  if (input.channel === 'email') {
    out.emailSubject = parsed.emailSubject || null
    out.emailHtml = parsed.emailHtml || null
  }
  return out
}

// ============================================================
// USAGE TRACKING
// ============================================================

/** Increment template usage stats — fire-and-forget. */
export async function recordTemplateUsage(templateId: string): Promise<void> {
  await prisma.messageTemplate.update({
    where: { id: templateId },
    data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
  }).catch(() => null)
}

// ============================================================
// DB <-> Template conversion
// ============================================================

export function dbToTemplate(row: any): Template {
  let variables: string[] = []
  try { variables = JSON.parse(row.variables || '[]') } catch {}
  let metaTemplateConfig: Template['metaTemplateConfig'] = null
  try { metaTemplateConfig = row.metaTemplateConfig ? JSON.parse(row.metaTemplateConfig) : null } catch {}
  return {
    id: row.id,
    businessId: row.businessId,
    name: row.name,
    description: row.description,
    channel: row.channel,
    category: row.category || 'marketing',
    body: row.body,
    metaTemplateName: row.metaTemplateName,
    smsBody: row.smsBody,
    emailSubject: row.emailSubject,
    emailHtml: row.emailHtml,
    emailText: row.emailText,
    variables,
    metaTemplateConfig,
    status: row.status,
  }
}

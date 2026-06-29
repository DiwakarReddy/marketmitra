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

  // Few-shot examples per channel — concrete, on-brand Hinglish so the model
  // doesn't fall back to the lazy "नमस्ते {{name}}!" placeholder.
  const examples: Record<TemplateChannel, string> = {
    whatsapp: `Example (reactivation for dental):
{
  "name": "Inactive Customer Reactivation",
  "description": "Win back customers who haven't visited in 90+ days with a 20% off offer",
  "body": "🙏 नमस्ते {{name}} जी!\\n\\n{{business.name}} में आपकी last visit को करीब 3 महीने हो गए — आपकी smile हमें याद है! 😊\\n\\nइस हफ़्ते specially आपके लिए: cleaning + checkup पर 20% off. Slot limited हैं.\\n\\nBook करने के लिए 'YES' reply करें, या call करें: 022-XXXX-XXXX.\\n\\n— {{business.ownerName}}, {{business.name}}",
  "variables": ["name", "business.name", "business.ownerName"]
}`,
    sms: `Example (appointment reminder):
{
  "name": "Appointment Reminder",
  "description": "24-hour reminder before scheduled appointment",
  "body": "{{business.name}}: {{name}} जी, कल {{appointment.date}} को आपका appointment है {{appointment.time}} बजे. Confirm करने के लिए 'Y' reply करें. — {{business.ownerName}}",
  "variables": ["name", "business.name", "business.name", "appointment.date", "appointment.time", "business.ownerName"]
}`,
    email: `Example (post-visit follow-up):
{
  "name": "Post-Visit Follow-up",
  "description": "Thank-you email 24 hours after a visit, asking for a Google review",
  "emailSubject": "Thank you for visiting {{business.name}}, {{name}} 🙏",
  "emailHtml": "<div style='font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;'><h2 style='color:#0f766e;'>Thank you, {{name}} जी!</h2><p>It was wonderful seeing you at {{business.name}} yesterday. We hope you're feeling great after your visit.</p><p>If you have a moment, a quick Google review really helps other customers find us:</p><p style='text-align:center;margin:24px 0;'><a href='https://g.page/r/{{business.name}}/review' style='display:inline-block;background:#0f766e;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;'>Leave a review →</a></p><p style='color:#64748b;font-size:14px;'>With warmth,<br><strong>{{business.ownerName}}</strong><br>{{business.name}}, {{business.city}}</p></div>",
  "variables": ["name", "business.name", "business.name", "business.ownerName", "business.city"]
}`,
  }

  // Channel-aware rules with hard limits + concrete structure
  const channelRules: Record<TemplateChannel, string> = {
    whatsapp: `Write a WhatsApp message 280-500 characters. Use Hinglish naturally — real mix of Devanagari Hindi + English words, NOT a literal English translation. Lead with a personal greeting using {{name}}. Mention the business by name once. Include ONE specific value proposition (offer, reminder, benefit, urgency). End with a single clear CTA (reply YES / call now / book a slot / tap the link). Use 1-3 emojis sprinkled naturally (🙏, 😊, 🎉). DO NOT return just '<h2>नमस्ते {{name}}!</h2><p>purpose</p>' — write a real marketing message.`,
    sms: `Write an SMS 140-160 characters (single segment). Plain text only, no HTML. One short greeting, one value prop, one CTA. Every character costs the customer money so be ruthlessly brief. No emojis unless absolutely needed.`,
    email: `Write an email. Subject line 30-55 chars, under 60 to avoid inbox cutoff. Body 200-400 words of HTML using <div>, <h2>, <p>, <strong>, <a> tags. Inline styles only (no external CSS). One <h2> heading, 2-3 short paragraphs, one prominent CTA button with <a href style='background:#0f766e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;'>...</a>. Sign off with owner name + business name + city. Use {{name}}, {{business.name}}, {{business.city}}, {{business.ownerName}} as tokens where they appear.`,
  }

  const variablesHint = `
Available variables (substituted at send time — keep them as-is in your output):
  {{name}} - customer's first name (ALWAYS use this in greeting)
  {{customer.name}}, {{customer.phone}}, {{customer.email}}
  {{customer.lastVisitAt}} - formatted date like "15 Jan 2025"
  {{customer.totalVisits}} - number
  {{customer.birthday}}, {{customer.anniversary}} - formatted dates
  {{business.name}} - business name
  {{business.city}}, {{business.ownerName}} - location and owner
  {{appointment.date}}, {{appointment.time}}, {{appointment.datetime}} - booking context
  {{custom.<key>}} - any custom field defined for this business

For real marketing copy, use {{name}} in the greeting and at least one of {{business.name}} or {{business.ownerName}} in the signature/closing.`

  const systemPrompt = `You are an experienced Indian marketing copywriter for small businesses on WhatsApp, SMS, and Email.

Client:
- Business: ${business.name} (${business.vertical} in ${business.city || 'India'})
- Owner: ${business.ownerName}
- Language: ${lang} — write natural Hinglish mixing Devanagari Hindi + English, the way real Indian SMB customers speak. Not formal Hindi, not formal English. Example flavor: "नमस्ते रिया जी, आज booking confirm है 🙏"
- Tone: ${tone}

Channel rules:
${channelRules[input.channel]}

${variablesHint}

Reference example for this channel (match this quality — DO NOT just copy it, but DO match the depth and structure):
${examples[input.channel]}

OUTPUT FORMAT — return ONLY a valid JSON object, no markdown fences, no commentary, no leading/trailing text:
{
  "name": "short internal name, 2-5 words",
  "description": "what this template is for, 1 sentence",
  ${input.channel === 'whatsapp' ? '"body": "the full WhatsApp message with {{tokens}}",' : ''}
  ${input.channel === 'sms' ? '"body": "the full SMS message with {{tokens}}",' : ''}
  ${input.channel === 'email' ? '"emailSubject": "subject line 30-55 chars", "emailHtml": "<full HTML body with {{tokens}} inline-styled>",' : ''}
  "variables": ["array", "of", "all", "tokens", "you", "used"]
}`

  const userMessage = `Write a ${input.channel} template for: ${input.purpose}
${input.audience ? `Target audience: ${input.audience}` : ''}

Remember: real marketing copy that sounds like a real Indian SMB owner wrote it, not a placeholder. Include {{name}} in greeting. Be specific about the offer/reminder. End with a clear CTA. Return JSON only — no markdown, no explanation.`

  const result = await guardedAICustom(input.businessId, systemPrompt, userMessage, {
    cacheTtl: 600, // 10 min cache — same prompt + same business = same template
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

// Build a complete template context for a customer.
// Combines: built-in customer fields, business defaults, custom field values,
// appointment context (if provided), and service context.
//
// Returned shape is flat-keyed for `fillTemplate(template, ctx)`:
//   {{customer.name}}, {{customer.last_treatment}}, {{business.name}}, etc.
// Plus shortcut keys for the most common ones: {{name}}, {{phone}}, {{businessName}}.

import type { Customer, Business, CustomField, CustomerFieldValue } from '@prisma/client'

export interface TemplateContextInput {
  customer: Customer & { customFieldValues?: (CustomerFieldValue & { field: CustomField })[] }
  business: Pick<Business, 'name' | 'ownerName' | 'city' | 'language' | 'currency'>
  appointment?: {
    startsAt: Date
    service?: { name: string; durationMin: number } | null
  } | null
  // Custom fields defined for this business (with options + type)
  customFieldDefs?: CustomField[]
}

export function buildTemplateContext(input: TemplateContextInput): Record<string, string> {
  const { customer, business, appointment, customFieldDefs = [] } = input
  const lang = business.language || 'hinglish'

  // Format helpers
  const fmtDate = (d: Date | null | undefined) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }
  const fmtTime = (d: Date | null | undefined) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    } catch {
      return ''
    }
  }
  const monthsSince = (d: Date | null | undefined) => {
    if (!d) return ''
    const ms = Date.now() - new Date(d).getTime()
    const months = Math.floor(ms / (30 * 86400000))
    return String(months)
  }

  const ctx: Record<string, string> = {
    // Shortcuts (most common)
    name: customer.name,
    phone: customer.phone,
    businessName: business.name,
    business_name: business.name,
    language: lang,
    currency: business.currency || 'INR',
    city: business.city || '',

    // customer.* namespaced
    'customer.name': customer.name,
    'customer.phone': customer.phone,
    'customer.email': customer.email || '',
    'customer.language': customer.language || lang,
    'customer.lastVisitAt': fmtDate(customer.lastVisitAt),
    'customer.lastVisitDaysAgo': customer.lastVisitAt
      ? String(Math.floor((Date.now() - new Date(customer.lastVisitAt).getTime()) / 86400000))
      : '',
    'customer.monthsSinceVisit': monthsSince(customer.lastVisitAt),
    'customer.totalVisits': String(customer.totalVisits || 0),
    'customer.birthday': fmtDate(customer.birthday),
    'customer.anniversary': fmtDate(customer.anniversary),
    'customer.tags': customer.tags || '',
    'customer.notes': customer.notes || '',

    // business.* namespaced
    'business.name': business.name,
    'business.ownerName': business.ownerName,
    'business.city': business.city || '',
  }

  // Inject custom field values. Two key styles are supported:
  //   - {{customer.last_treatment}} (preferred — namespaced)
  //   - {{last_treatment}} (legacy shortcut)
  // Map custom field defs → values from customer.customFieldValues
  const valueByFieldId = new Map<string, string>()
  for (const v of customer.customFieldValues || []) {
    valueByFieldId.set(v.fieldId, v.value)
  }
  for (const def of customFieldDefs) {
    const raw = valueByFieldId.get(def.id) || ''
    if (!raw) continue
    // Cast value per type for display
    let display = raw
    if (def.type === 'boolean') {
      display = /^(true|1|yes)$/i.test(raw) ? 'Yes' : 'No'
    } else if (def.type === 'date') {
      display = fmtDate(new Date(raw))
    } else if ((def.type === 'select' || def.type === 'multiselect') && def.options) {
      // Multiselect: comma-separated string → human-readable list
      try {
        const opts = JSON.parse(def.options) as string[]
        const items = raw.split(',').map((s) => s.trim()).filter(Boolean)
        const mapped = items.map((i) => opts.find((o) => o === i) || i)
        display = mapped.join(', ')
      } catch {
        // ignore
      }
    }
    ctx[def.key] = display
    ctx[`customer.${def.key}`] = display
  }

  // Appointment context
  if (appointment) {
    ctx['appointment.date'] = fmtDate(appointment.startsAt)
    ctx['appointment.time'] = fmtTime(appointment.startsAt)
    ctx['appointment.datetime'] = `${ctx['appointment.date']} at ${ctx['appointment.time']}`
    ctx['appointment.service'] = appointment.service?.name || ''
    ctx['service'] = appointment.service?.name || ''
    ctx['service.duration'] = appointment.service?.durationMin ? `${appointment.service.durationMin} min` : ''
  }

  return ctx
}

// Extract a list of `{{customer.<key>}}` and `{{<key>}}` placeholders used in a template body.
// Used by the drip builder and broadcast composer to surface required customer fields.
export function extractTemplatePlaceholders(body: string): string[] {
  if (!body) return []
  const found = new Set<string>()
  const matches = body.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g) || []
  for (const m of matches) {
    const key = m.replace(/[{}\s]/g, '')
    if (!/^\d+$/.test(key)) found.add(key)
  }
  return [...found]
}
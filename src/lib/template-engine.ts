// Replace Meta template placeholders ({{1}}, {{2}}, etc.) with actual values.
// Also supports {{businessName}} and {{phone}} as named placeholders for convenience.

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  if (!template) return ''
  let out = template

  // Named placeholders first ({{businessName}}, {{phone}}, etc.)
  for (const [key, val] of Object.entries(values)) {
    if (val === undefined || val === null) continue
    const safeVal = String(val)
    const namedRe = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
    out = out.replace(namedRe, safeVal)
  }

  // Numeric placeholders ({{1}}, {{2}}, ...)
  const numericMatches = Array.from(out.match(/\{\{\s*(\d+)\s*\}\}/g) || [])
  for (const m of numericMatches) {
    const num = m.replace(/[{}]/g, '').trim()
    // Try to find a value keyed by var_N or by the number as string
    const val =
      values[`var_${num}`] ??
      values[num] ??
      values[String(num)] ??
      ''
    if (val) {
      out = out.replace(new RegExp(`\\{\\{\\s*${num}\\s*\\}\\}`, 'g'), String(val))
    }
  }

  return out
}

// Sample builder: show what a template looks like with realistic values,
// useful for the "Show preview" button on the Templates page.
export function sampleTemplate(
  template: string,
  variableNames: string[] = [],
  businessName = 'SmileCare Dental'
): string {
  const sampleValues: Record<string, string> = {
    name: 'Riya',
    businessName,
    business_name: businessName,
    phone: '+91 98765 43210',
    service: 'Dental Cleaning',
    last_visit_date: '15 जनवरी',
    months_since: '6',
    discount_pct: '20',
    review_link: 'https://g.page/r/smilecare-indore',
    booking_link: 'https://marketmitra.com/book/smilecare',
    date: 'रविवार, 28 जून',
    datetime: 'कल 2:00 PM',
    time: '2:00 PM',
    name_again: 'रिया',
    festival_name: 'दीवाली',
    var_1: 'रिया',
    var_2: 'Dental Cleaning',
    var_3: 'https://g.page/r/smilecare-indore',
    var_4: '6',
    var_5: '20',
    var_6: 'https://marketmitra.com/book/smilecare',
  }
  // Apply named ones first
  const known = new Set<string>()
  let out = template
  for (const name of variableNames) {
    if (sampleValues[name] !== undefined) {
      out = out.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), sampleValues[name])
      known.add(name)
    }
  }
  // Fill any remaining {{1}}..{{N}} with var_N or sequential defaults
  const numeric = Array.from(out.match(/\{\{\s*(\d+)\s*\}\}/g) || [])
  for (const m of numeric) {
    const num = m.replace(/[{}]/g, '').trim()
    const idx = parseInt(num, 10) - 1
    const fallback = ['रिया जी', 'Dental Cleaning', 'https://example.com', '6', '20', 'https://example.com/book'][idx] ?? `value ${num}`
    out = out.replace(new RegExp(`\\{\\{\\s*${num}\\s*\\}\\}`, 'g'), fallback)
  }
  return out
}
import Papa from 'papaparse'

export interface ParsedCustomer {
  name: string
  phone: string
  email?: string
  lastVisitAt?: Date
  totalVisits?: number
  totalSpentPaise?: number
  tags?: string[]
  notes?: string
  errors: string[]  // validation errors per row
}

export interface CSVParseResult {
  customers: ParsedCustomer[]
  totalRows: number
  validRows: number
  errors: { row: number; error: string }[]
}

// Parse a CSV string. Expected columns (case-insensitive, flexible):
//   name, phone (or mobile/phone_number), email, last_visit (or lastVisit),
//   visits (or total_visits), spent (or total_spent), tags, notes

export function parseCustomersCSV(csvText: string): CSVParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  const customers: ParsedCustomer[] = []
  const errors: { row: number; error: string }[] = []

  result.data.forEach((row, idx) => {
    const rowNum = idx + 2 // header is row 1, data starts at row 2
    const rowErrors: string[] = []

    const name = (row.name || row.customer_name || row.full_name || '').trim()
    const phoneRaw = row.phone || row.mobile || row.phone_number || row.cell || ''
    const phone = normalizePhone(phoneRaw)

    if (!name) rowErrors.push('Missing name')
    if (!phone) rowErrors.push('Missing or invalid phone number')

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, error: rowErrors.join(', ') })
      return
    }

    const lastVisit = parseDate(row.last_visit || row.lastvisit || row.last_visit_date || row.last_visit_at)
    const visits = parseInt(row.visits || row.total_visits || row.visit_count || '0') || 0
    const spent = parseRupees(row.spent || row.total_spent || row.amount || '0')
    const tags = (row.tags || row.tag || '').split(/[,;]/).map((t) => t.trim()).filter(Boolean)
    const notes = (row.notes || row.note || '').trim() || undefined

    customers.push({
      name,
      phone: phone!,
      email: (row.email || '').trim() || undefined,
      lastVisitAt: lastVisit || undefined,
      totalVisits: visits,
      totalSpentPaise: spent,
      tags: tags.length > 0 ? tags : undefined,
      notes,
      errors: [],
    })
  })

  return {
    customers,
    totalRows: result.data.length,
    validRows: customers.length,
    errors,
  }
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null

  // Strip everything except digits and +
  let cleaned = raw.replace(/[^\d+]/g, '')

  // Ensure starts with +
  if (!cleaned.startsWith('+')) {
    // Assume India if 10 digits
    if (cleaned.length === 10) cleaned = `+91${cleaned}`
    // Add + if missing but has country code
    else if (cleaned.length >= 11) cleaned = `+${cleaned}`
  }

  // Validate: must be at least 10 digits after +
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 15) return null

  return cleaned
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Try ISO first
  const iso = new Date(trimmed)
  if (!isNaN(iso.getTime())) return iso

  // Try common formats: DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY
  const m = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    let [, a, b, y] = m
    let day = parseInt(a), month = parseInt(b)
    if (y.length === 2) y = `20${y}`
    // Assume DD/MM/YYYY if first > 12
    if (day > 12) {
      return new Date(parseInt(y), month - 1, day)
    }
    // Otherwise ambiguous; default to DD/MM/YYYY (Indian convention)
    return new Date(parseInt(y), month - 1, day)
  }

  return null
}

function parseRupees(raw: string | undefined): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d.]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return 0
  // If looks like rupees (no decimals), multiply by 100 for paise
  // If has decimals, treat as already in rupees
  if (cleaned.includes('.')) {
    return Math.round(num * 100)
  }
  return Math.round(num * 100)
}
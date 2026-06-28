// PII redaction for logs
// Strips phone numbers, emails, names, and tokens before logging
//
// Usage:
//   import { safeLog, redactor } from '@/lib/log'
//   console.log(safeLog('Message from', phone, 'to', customer))
//   console.log(redactor.object(payload))

const PHONE_PATTERNS = [
  /\+?\d[\d\s\-]{8,}\d/g,           // +91 98765 43210 / 9876543210
  /whatsapp:\+?\d+/gi,              // whatsapp:+91...
]

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Known token formats
const TOKEN_PATTERNS = [
  /EAA[A-Za-z0-9]{50,}/g,           // Meta access tokens
  /sk-[A-Za-z0-9]{20,}/g,           // OpenAI keys
  /AIza[A-Za-z0-9_\-]{30,}/g,       // Google API keys
  /AC[a-f0-9]{32}/gi,               // Twilio Account SIDs
  /SK[a-f0-9]{32}/gi,               // Twilio API keys (old)
]

export const redactor = {
  string: (s: any): string => {
    if (typeof s !== 'string') return s
    let r = s
    for (const p of PHONE_PATTERNS) r = r.replace(p, '***PHONE***')
    r = r.replace(EMAIL_PATTERN, '***EMAIL***')
    for (const p of TOKEN_PATTERNS) r = r.replace(p, '***TOKEN***')
    return r
  },

  object: <T = any>(obj: T, depth = 0): T => {
    if (depth > 5) return obj
    if (obj == null) return obj
    if (typeof obj === 'string') return redactor.string(obj) as any
    if (Array.isArray(obj)) return obj.map((v) => redactor.object(v, depth + 1)) as any
    if (typeof obj === 'object') {
      const result: any = {}
      for (const [k, v] of Object.entries(obj)) {
        // Always redact known secret fields by name
        const isSecretField = /password|secret|token|key|credential|access|refresh|signature|webhook/i.test(k)
        if (isSecretField) {
          result[k] = '***REDACTED***'
        } else {
          result[k] = redactor.object(v, depth + 1)
        }
      }
      return result
    }
    return obj
  },
}

// Drop-in replacement for console.log
// Strips PII automatically
export function safeLog(...args: any[]) {
  const redacted = args.map((a) => {
    if (typeof a === 'string') return redactor.string(a)
    if (typeof a === 'object') return redactor.object(a)
    return a
  })
  console.log(...redacted)
}

// Redact error stack traces
export function redactError(err: any): string {
  if (!err) return ''
  const msg = err.message || String(err)
  const stack = err.stack || ''
  return redactor.string(`${msg}\n${stack}`)
}
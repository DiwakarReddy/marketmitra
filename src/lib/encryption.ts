// AES-256-GCM encryption for storing channel credentials
// Key comes from ENCRYPTION_KEY env var (set by founder, 64 hex chars = 32 bytes)
// In dev: falls back to a known dev key (NEVER use in prod)

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production. Set it in your env vars (generate with: openssl rand -hex 32)')
    }
    // Dev fallback — INSECURE, only for local testing
    console.warn('[encryption] Using DEV fallback key. Set ENCRYPTION_KEY in production!')
    return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex')
  }
  // Allow both hex (64 chars) and base64 keys
  if (key.length === 64 && /^[0-9a-f]+$/i.test(key)) {
    return Buffer.from(key, 'hex')
  }
  return Buffer.from(key, 'base64')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}

export function encryptJSON(obj: Record<string, any>): string {
  return encrypt(JSON.stringify(obj))
}

export function decryptJSON<T = Record<string, any>>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext))
}

// Mask sensitive values for display (show last 4 chars)
export function mask(value: string): string {
  if (!value || value.length < 8) return '••••••'
  return '•'.repeat(Math.max(8, value.length - 4)) + value.slice(-4)
}
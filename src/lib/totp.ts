// Simple TOTP implementation (RFC 6238)
// Used for 2FA - no external dependencies

import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(encoded: string): Buffer {
  encoded = encoded.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of encoded) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generateSecret(length = 20): string {
  return base32Encode(crypto.randomBytes(length))
}

export function generateTOTP(secret: string, time = Math.floor(Date.now() / 1000), period = 30, digits = 6): string {
  const counter = Math.floor(time / period)
  const buffer = Buffer.alloc(8)
  buffer.writeBigInt64BE(BigInt(counter))
  const key = base32Decode(secret)
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 10 ** digits).padStart(digits, '0')
}

export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  if (!token || !secret) return false
  const now = Math.floor(Date.now() / 1000)
  for (let i = -window; i <= window; i++) {
    const expected = generateTOTP(secret, now + i * 30)
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true
    }
  }
  return false
}

export function generateOTPAuthURI(secret: string, accountName: string, issuer = 'MarketMitra'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
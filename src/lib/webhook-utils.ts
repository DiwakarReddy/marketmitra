// Webhook edge case handlers
// Shared across channel webhooks (WhatsApp, Voice, Instagram)
//
// Handles:
//  - Idempotency (Meta retries cause duplicates)
//  - Phone normalization (Meta, Twilio, AiSensy formats)
//  - Per-provider signature verification
//  - Business state (deleted, paused) checks
//  - Status update handling (delivery/read receipts)

import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { audit } from '@/lib/audit'

// In-memory idempotency cache (per process)
// For multi-instance prod, swap with Redis or DB table
const SEEN_MESSAGE_IDS = new Map<string, number>() // messageId -> expiresAt
const SEEN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Cleanup old entries periodically (lazy — runs every 100 inserts)
let seenInsertCount = 0
function cleanupSeenCache() {
  if (++seenInsertCount < 100) return
  seenInsertCount = 0
  const now = Date.now()
  for (const [key, expiresAt] of SEEN_MESSAGE_IDS) {
    if (expiresAt < now) SEEN_MESSAGE_IDS.delete(key)
  }
}

export function isMessageAlreadyProcessed(messageId: string): boolean {
  cleanupSeenCache()
  const expiresAt = SEEN_MESSAGE_IDS.get(messageId)
  if (expiresAt && expiresAt > Date.now()) return true
  SEEN_MESSAGE_IDS.set(messageId, Date.now() + SEEN_CACHE_TTL_MS)
  return false
}

// Check business state — return error response if can't process
export async function checkBusinessCanReceiveMessages(businessId: string): Promise<
  { ok: true; business: any } | { ok: false; reason: 'not_found' | 'deleted' | 'paused'; status: number }
> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true, name: true, language: true, plan: true,
      pausedAt: true, deletedAt: true, knowledge: true,
      ownerName: true, vertical: true, city: true,
    },
  })

  if (!business) return { ok: false, reason: 'not_found', status: 404 }
  if (business.deletedAt) return { ok: false, reason: 'deleted', status: 410 }
  if (business.pausedAt) return { ok: false, reason: 'paused', status: 403 }
  return { ok: true, business }
}

// Normalize phone numbers across providers
// Meta:     "919876543210"  (no +)
// Twilio:   "whatsapp:+919876543210"
// AiSensy:  "919876543210"
// Gupshup:  "919876543210"
// All should normalize to: "919876543210" (digits only with country code)
export function normalizePhoneNumber(raw: string, provider?: string): string {
  if (!raw) return ''
  let phone = raw.trim()

  // Strip prefixes
  phone = phone.replace(/^whatsapp:/i, '')
  phone = phone.replace(/^\+/, '')
  phone = phone.replace(/[^0-9]/g, '')

  // India (default): if 10 digits, prepend 91
  if (phone.length === 10) {
    phone = '91' + phone
  }

  // Final sanity: must be 11-15 digits
  if (phone.length < 11 || phone.length > 15) {
    return '' // invalid
  }

  return phone
}

// Per-provider signature verification
// Returns true if valid, false if invalid, null if signature not required
export async function verifyWebhookSignature(opts: {
  provider: 'meta' | 'twilio' | 'aisensy' | 'gupshup' | string
  rawBody: string
  signature: string | null
  url: string                       // Required for Twilio HMAC
  credentials: Record<string, string>
  mode: 'required' | 'optional' | 'off'  // dev/prod override
}): Promise<{ ok: boolean; reason?: string }> {
  if (opts.mode === 'off') return { ok: true }
  if (!opts.signature && opts.mode === 'optional') return { ok: true }
  if (!opts.signature) return { ok: false, reason: 'no_signature' }

  // Meta / AiSensy / Gupshup use HMAC-SHA256 with app secret
  if (opts.provider === 'meta' || opts.provider === 'aisensy' || opts.provider === 'gupshup') {
    const secret = opts.credentials.appSecret || opts.credentials.webhookVerifyToken
    if (!secret) return { ok: false, reason: 'no_secret' }

    const provided = opts.signature.replace(/^sha256=/, '').trim()
    const expected = crypto.createHmac('sha256', secret).update(opts.rawBody, 'utf8').digest('hex')

    if (expected.length !== provided.length) {
      return { ok: false, reason: 'length_mismatch' }
    }
    try {
      const ok = crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
      return ok ? { ok: true } : { ok: false, reason: 'mismatch' }
    } catch (err) {
      return { ok: false, reason: 'decode_error' }
    }
  }

  // Twilio: HMAC-SHA1 of URL + sorted POST params with auth token
  if (opts.provider === 'twilio') {
    const authToken = opts.credentials.authToken
    if (!authToken) return { ok: false, reason: 'no_token' }

    // Twilio's signature is HMAC-SHA1(base64) of url + sorted form params
    // For JSON body, we use the URL + body
    const data = opts.url + opts.rawBody
    const expected = crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64')

    if (expected.length !== opts.signature.length) {
      return { ok: false, reason: 'length_mismatch' }
    }
    try {
      const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(opts.signature))
      return ok ? { ok: true } : { ok: false, reason: 'mismatch' }
    } catch (err) {
      return { ok: false, reason: 'decode_error' }
    }
  }

  // Unknown provider — accept in dev, reject in prod
  if (opts.mode === 'required') {
    return { ok: false, reason: 'unknown_provider' }
  }
  return { ok: true }
}

// Extract message ID from various webhook formats (for idempotency)
export function extractMessageId(provider: string, body: any): string | null {
  try {
    if (provider === 'meta') {
      return body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || null
    }
    if (provider === 'twilio') {
      return body.MessageSid || body.SmsSid || null
    }
    if (provider === 'aisensy' || provider === 'gupshup') {
      return body.message_id || body.msgId || body.id || null
    }
    // Fallback: hash the body
    return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)
  } catch (err) {
    return null
  }
}

// Check if webhook payload is a status update (delivery/read receipt)
// Returns array of status updates to apply, empty if not a status event
export interface StatusUpdate {
  messageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: number
  error?: string
}

export function extractStatusUpdates(provider: string, body: any): StatusUpdate[] {
  try {
    if (provider === 'meta') {
      const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses
      if (!Array.isArray(statuses)) return []
      return statuses.map((s: any) => ({
        messageId: s.id,
        status: s.status as any,
        timestamp: parseInt(s.timestamp) * 1000,
        error: s.errors?.[0]?.title,
      }))
    }
    if (provider === 'twilio') {
      const results: StatusUpdate[] = []
      if (body.MessageSid && body.MessageStatus) {
        const statusMap: Record<string, StatusUpdate['status']> = {
          sent: 'sent',
          delivered: 'delivered',
          read: 'read',
          failed: 'failed',
          undelivered: 'failed',
        }
        results.push({
          messageId: body.MessageSid,
          status: statusMap[body.MessageStatus] || 'sent',
          timestamp: Date.now(),
          error: body.ErrorCode ? `Twilio error ${body.ErrorCode}` : undefined,
        })
      }
      return results
    }
    if (provider === 'aisensy' || provider === 'gupshup') {
      if (body.type === 'message_status' || body.event === 'message_status') {
        return [{
          messageId: body.message_id || body.id,
          status: (body.status || 'sent') as any,
          timestamp: Date.now(),
        }]
      }
    }
    return []
  } catch (err) {
    return []
  }
}

// Apply status updates to existing messages in DB
export async function applyStatusUpdates(businessId: string, updates: StatusUpdate[]) {
  if (updates.length === 0) return

  // Find matching outbound messages and update their delivery status
  // Messages are linked by external_id (provider's message ID) if stored, or by conversation/customer fallback
  for (const u of updates) {
    const message = await prisma.message.findFirst({
      where: {
        externalId: u.messageId,
        conversation: { businessId },
      },
    })
    if (message) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: u.status,
          deliveredAt: u.status === 'delivered' || u.status === 'read' ? new Date(u.timestamp) : undefined,
          readAt: u.status === 'read' ? new Date(u.timestamp) : undefined,
          failedAt: u.status === 'failed' ? new Date(u.timestamp) : undefined,
          errorMessage: u.error,
        },
      })
    }
  }
}

// Sanitize inbound message text (strip dangerous control chars, normalize whitespace)
export function sanitizeMessageText(text: string): string {
  if (!text) return ''
  return text
    // Strip control chars except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Collapse excessive whitespace
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, 4000) // WhatsApp limit
}

// Log webhook attempt (always — for debugging)
export async function logWebhookAttempt(opts: {
  businessId: string
  channel: string
  provider: string
  messageId: string | null
  outcome: 'processed' | 'duplicate' | 'signature_failed' | 'business_inactive' | 'error'
  error?: string
  metadata?: Record<string, any>
}) {
  try {
    await audit({
      businessId: opts.businessId,
      channel: opts.channel,
      action: 'accessed',
      actor: 'system',
      testResult: opts.outcome === 'processed' ? 'success' : 'failed',
      testError: opts.error,
      metadata: { provider: opts.provider, messageId: opts.messageId, outcome: opts.outcome, ...opts.metadata },
    })
  } catch (err) {
    // Audit failure shouldn't break webhook
  }
}
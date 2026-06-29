// Webhook edge case handlers
// Shared across channel webhooks (WhatsApp, Voice, Instagram, Email, SMS)
//
// Handles:
//  - Idempotency (provider retries, multi-instance dedupe via Redis)
//  - Phone normalization (Meta, Twilio, AiSensy formats)
//  - Per-provider signature verification
//  - Business state (deleted, paused) checks
//  - Status update handling (delivery/read receipts)
//
// Why this file matters at scale:
//   - WhatsApp + Meta retried webhooks 3-5x during a single network blip.
//     Without proper dedupe, you process each inbound 3-5x and the customer
//     gets 3-5 AI replies.
//   - The dedupe cache here is Redis-backed when available (so dedupe
//     survives across all your Vercel functions / instances); falls back
//     to an in-process map when Redis is missing (single-instance dev).

import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { audit } from '@/lib/audit'
import { getOrSet, set, getRedis, cacheKeys } from './cache'

/** In-process fallback when Redis isn't configured. Per-instance only. */
const SEEN_MESSAGE_IDS = new Map<string, number>() // messageId -> expiresAt
const SEEN_CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes — covers Meta's longest retry window

function cleanupSeenCache() {
  if (SEEN_MESSAGE_IDS.size === 0) return
  const now = Date.now()
  for (const [key, expiresAt] of SEEN_MESSAGE_IDS) {
    if (expiresAt < now) SEEN_MESSAGE_IDS.delete(key)
  }
}

/**
 * Check whether a webhook message id has already been processed.
 *
 * Cross-instance safe: when Redis is available we check it first
 * (the source of truth). In-process map is the fast path fallback.
 *
 * To "mark" a message as seen, use markMessageProcessed() AFTER
 * successful processing — not here. This is just the check.
 */
export async function isMessageAlreadyProcessed(provider: string, businessId: string, messageId: string): Promise<boolean> {
  if (!messageId) return false

  // 1. Try Redis (cross-instance)
  const key = cacheKeys.webhookSeen(provider, businessId, messageId)
  const redis = await getRedis()
  if (redis) {
    try {
      const v = await redis.get(key)
      if (v) return true
    } catch {
      // fall through to L1
    }
  }

  // 2. L1 fallback
  cleanupSeenCache()
  const expiresAt = SEEN_MESSAGE_IDS.get(key)
  if (expiresAt && expiresAt > Date.now()) return true
  return false
}

/**
 * Mark a webhook message id as processed. Called after successful
 * processing so subsequent retries are short-circuited.
 */
export async function markMessageProcessed(provider: string, businessId: string, messageId: string, ttlSec: number = 600): Promise<void> {
  if (!messageId) return
  const key = cacheKeys.webhookSeen(provider, businessId, messageId)

  // Redis (durable)
  const redis = await getRedis()
  if (redis) {
    try {
      await redis.set(key, '1', 'EX', ttlSec)
    } catch {
      // fall through
    }
  }

  // L1 (fast)
  SEEN_MESSAGE_IDS.set(key, Date.now() + ttlSec * 1000)
}

/**
 * Synchronous version used by webhook handlers when we want to do
 * the dedupe check + mark in one call (avoids the second round-trip).
 *
 * Returns true if this is a duplicate (already seen). If false, the
 * message has been marked as seen in both tiers.
 */
export async function checkAndMarkProcessed(provider: string, businessId: string, messageId: string, ttlSec: number = 600): Promise<boolean> {
  const dup = await isMessageAlreadyProcessed(provider, businessId, messageId)
  if (dup) return true
  await markMessageProcessed(provider, businessId, messageId, ttlSec)
  return false
}

// Check business state — return error response if can't process
export async function checkBusinessCanReceiveMessages(businessId: string): Promise<
  { ok: true; business: any } | { ok: false; reason: 'not_found' | 'deleted' | 'paused' | 'no_active_business'; status: number }
> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true, name: true, language: true, plan: true,
      pausedAt: true, deletedAt: true, knowledge: true,
      ownerName: true, vertical: true, city: true,
      timezone: true, currency: true,
      usingPlatformKey: true,
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
  provider: 'meta' | 'twilio' | 'aisensy' | 'gupshup' | 'resend' | 'msg91' | 'plivo' | string
  rawBody: string
  signature: string | null
  url: string                       // Required for Twilio HMAC
  credentials: Record<string, string>
  mode: 'required' | 'optional' | 'off'  // dev/prod override
}): Promise<{ ok: boolean; reason?: string }> {
  if (opts.mode === 'off') return { ok: true }
  if (!opts.signature && opts.mode === 'optional') return { ok: true }
  if (!opts.signature) return { ok: false, reason: 'no_signature' }

  // Meta / AiSensy / Gupshup use HMAC-SHA256 with the app secret
  if (opts.provider === 'meta' || opts.provider === 'aisensy' || opts.provider === 'gupshup') {
    // For Meta: appSecret is required (webhookVerifyToken is for GET handshake only)
    // For AiSensy/360dialog/Gupshup: appSecret if they support HMAC, else webhookVerifyToken
    const secret = opts.provider === 'meta'
      ? opts.credentials.appSecret
      : (opts.credentials.appSecret || opts.credentials.webhookVerifyToken)
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

  // Resend: HMAC-SHA256 base64 encoded (Svix-format)
  if (opts.provider === 'resend') {
    const secret = opts.credentials.webhookSecret
    if (!secret) return { ok: false, reason: 'no_secret' }
    // Svix format: t=<ts>,v1=<sig> — handled in resend-specific helpers
    return { ok: true } // delegate to provider-specific route
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
    if (provider === 'resend') {
      // Resend inbound: data.id or data.email_id
      return body.data?.id || body.data?.email_id || null
    }
    if (provider === 'msg91') {
      return body.requestId || body.data?.requestId || null
    }
    if (provider === 'plivo') {
      return body.MessageUUID || body.message_uuid || null
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
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | 'complained'
  timestamp: number
  channel: 'whatsapp' | 'sms' | 'email'
  error?: string
  /** For email: the recipient that bounced/complained */
  recipient?: string
}

export function extractStatusUpdates(provider: string, body: any, channel?: 'whatsapp' | 'sms' | 'email'): StatusUpdate[] {
  try {
    if (provider === 'meta') {
      const statuses = body.entry?.[0]?.changes?.[0]?.value?.statuses
      if (!Array.isArray(statuses)) return []
      return statuses.map((s: any) => ({
        messageId: s.id,
        status: s.status as any,
        timestamp: parseInt(s.timestamp) * 1000,
        channel: 'whatsapp',
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
          channel: channel || 'sms',
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
          channel: 'whatsapp',
        }]
      }
    }
    // Resend: email delivery / bounce / complaint events
    if (provider === 'resend') {
      const eventType: string = body.type || ''
      const data = body.data || {}
      const messageId = data.email_id || data.id
      if (!messageId) return []
      const map: Record<string, StatusUpdate['status']> = {
        'email.delivered': 'delivered',
        'email.bounced': 'bounced',
        'email.complained': 'complained',
        'email.sent': 'sent',
      }
      const status = map[eventType]
      if (!status) return []
      return [{
        messageId,
        status,
        timestamp: Date.now(),
        channel: 'email',
        error: status === 'bounced' ? (data.bounce?.reason || 'bounced') : undefined,
        recipient: Array.isArray(data.to) ? data.to[0] : data.to,
      }]
    }
    return []
  } catch (err) {
    return []
  }
}

/**
 * Apply status updates to existing messages in DB.
 * Multi-channel aware — matches Message by externalId regardless of channel.
 */
export async function applyStatusUpdates(businessId: string, updates: StatusUpdate[]) {
  if (updates.length === 0) return

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
          failedAt: (u.status === 'failed' || u.status === 'bounced') ? new Date(u.timestamp) : undefined,
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
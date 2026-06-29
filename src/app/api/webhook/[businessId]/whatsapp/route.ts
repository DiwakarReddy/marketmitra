// Per-tenant WhatsApp webhook
//
// URL format: https://yourdomain.com/api/webhook/{businessId}/whatsapp
//
// Each business gets a unique URL to configure in their Meta/AiSensy/Twilio dashboard.
// Business ID is part of the URL itself — no per-payload disambiguation needed.
//
// Handles: Meta Cloud API, AiSensy, Gupshup, Twilio WhatsApp
// Edge cases covered:
//  - Idempotency (Meta retries) — cross-instance via Redis
//  - Phone normalization (Meta/Twilio/AiSensy formats)
//  - Per-provider signature verification
//  - Status updates (delivery/read receipts)
//  - Business state checks (deleted, paused)
//  - Inbound text sanitization

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateAIReply } from '@/lib/ai'
import { sendWhatsAppMessage, normalizeInboundWebhook } from '@/lib/whatsapp'
import { decryptJSON } from '@/lib/kms'
import {
  checkAndMarkProcessed,
  checkBusinessCanReceiveMessages,
  normalizePhoneNumber,
  verifyWebhookSignature,
  extractMessageId,
  extractStatusUpdates,
  applyStatusUpdates,
  sanitizeMessageText,
  logWebhookAttempt,
} from '@/lib/webhook-utils'
import { guardedAIReply } from '@/lib/ai-guard'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { invalidatePrefix } from '@/lib/cache'

// GET = webhook verification challenge (Meta-compatible)
export async function GET(
  req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({
      ok: true,
      service: 'MarketMitra WhatsApp webhook',
      businessId: params.businessId,
      message: 'Send POST with your provider payload. Use hub.mode=subscribe&hub.verify_token=... for verification.',
    })
  }

  // Look up the business's webhook verify token
  const cfg = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId: params.businessId, channel: 'whatsapp' } },
  })
  if (!cfg) {
    return NextResponse.json({ error: 'Business not found or WhatsApp not configured' }, { status: 404 })
  }

  let verifyToken: string | undefined
  if (cfg.credentials) {
    try {
      const creds = await decryptJSON<Record<string, string>>(cfg.credentials, params.businessId)
      verifyToken = creds.webhookVerifyToken
    } catch (err) {}
  }
  if (!verifyToken) {
    return NextResponse.json({ error: 'No verify token configured' }, { status: 400 })
  }

  if (token === verifyToken) {
    console.log(`[WhatsApp webhook] Verified for business ${params.businessId}`)
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return NextResponse.json({ error: 'Invalid verify_token' }, { status: 403 })
}

// POST = incoming message or status update
export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const businessId = params.businessId
  let provider = 'meta'
  let messageId: string | null = null

  // Rate limit (IP-based) to prevent webhook flooding
  const rl = applyRateLimit(req, businessId, 'api')
  if (rl && !rl.allowed) return rateLimitResponse(rl)

  try {
    // Business state check FIRST (cheap, doesn't need body)
    const stateCheck = await checkBusinessCanReceiveMessages(businessId)
    if (!stateCheck.ok) {
      return NextResponse.json({ error: `business_${stateCheck.reason}` }, { status: stateCheck.status })
    }

    const rawBody = await req.text()
    const body = JSON.parse(rawBody)

    // Load config
    const cfg = await prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    })
    if (!cfg || !cfg.isActive) {
      return NextResponse.json({ error: 'WhatsApp not configured for this business' }, { status: 404 })
    }
    provider = (cfg.provider as any) || 'meta'

    // Extract message ID early for idempotency
    messageId = extractMessageId(provider, body)

    // Decrypt credentials for signature verification
    let credentials: Record<string, string> = {}
    if (cfg.credentials) {
      try {
        credentials = await decryptJSON<Record<string, string>>(cfg.credentials, businessId)
      } catch (err) {
        // Fall through with empty creds — verifier will reject
      }
    }

    // Verify signature
    const url = req.url
    const signature =
      req.headers.get('x-hub-signature-256') ||
      req.headers.get('x-aisensy-signature') ||
      req.headers.get('x-api-signature') ||
      req.headers.get('x-twilio-signature')

    const sigMode = process.env.NODE_ENV === 'production' ? 'required' : 'optional'
    const sigResult = await verifyWebhookSignature({
      provider, rawBody, signature, url, credentials, mode: sigMode,
    })

    if (!sigResult.ok) {
      await logWebhookAttempt({
        businessId, channel: 'whatsapp', provider,
        messageId, outcome: 'signature_failed',
        error: sigResult.reason,
      })
      return NextResponse.json({ error: 'signature_verification_failed', reason: sigResult.reason }, { status: 401 })
    }

    // STATUS UPDATE HANDLING (delivery/read receipts)
    const statusUpdates = extractStatusUpdates(provider, body)
    if (statusUpdates.length > 0) {
      await applyStatusUpdates(businessId, statusUpdates)
      await logWebhookAttempt({
        businessId, channel: 'whatsapp', provider, messageId,
        outcome: 'processed',
        metadata: { type: 'status_update', count: statusUpdates.length },
      })
      return NextResponse.json({ ok: true, type: 'status_update', applied: statusUpdates.length })
    }

    // Check if this is an actual message (vs other event like template update)
    const inbound = normalizeInboundWebhook(provider as any, body)
    if (!inbound) {
      // Not a message — maybe a different event type. Acknowledge with 200 so Meta stops retrying.
      return NextResponse.json({ ok: true, skipped: 'not_a_message' })
    }

    // Idempotency: skip if we've already processed this message ID
    // (cross-instance via Redis when available)
    if (messageId) {
      const dup = await checkAndMarkProcessed(provider, businessId, messageId)
      if (dup) {
        await logWebhookAttempt({
          businessId, channel: 'whatsapp', provider, messageId,
          outcome: 'duplicate',
        })
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    // Normalize phone
    const normalizedPhone = normalizePhoneNumber(inbound.phone, provider)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
    }
    inbound.phone = normalizedPhone
    inbound.message = sanitizeMessageText(inbound.message)

    if (!inbound.phone || !inbound.message) {
      return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
    }

    inbound.businessId = businessId

    return await processInboundMessage(businessId, inbound, messageId)
  } catch (err: any) {
    console.error('[WhatsApp webhook] error:', err)
    await logWebhookAttempt({
      businessId, channel: 'whatsapp', provider,
      messageId, outcome: 'error',
      error: err.message,
    }).catch(() => {})
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

async function processInboundMessage(businessId: string, inbound: any, messageId: string | null) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { services: { where: { active: true } }, hours: true },
  })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Find or create customer
  let customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone: inbound.phone } },
  })
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        businessId,
        phone: inbound.phone,
        name: inbound.senderName,
        language: business.language,
        tags: JSON.stringify(['whatsapp_inbound']),
      },
    })
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: { businessId, customerId: customer.id, channel: 'whatsapp' },
    orderBy: { lastMessageAt: 'desc' },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        businessId, customerId: customer.id, channel: 'whatsapp', status: 'ai_handling',
      },
    })
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
    })
  }

  // Save inbound message (with external ID for dedup tracking)
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'inbound',
      sender: 'customer',
      content: inbound.message,
      externalId: messageId || undefined,
    },
  })

  // Stop any active drip enrollments — customer replied
  const { stopAllEnrollments } = await import('@/lib/drips')
  await stopAllEnrollments(customer.id, 'replied').catch(() => null)

  // Generate AI reply (guarded: budget + rate-limit + concurrent + cost burst + cache)
  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id }, orderBy: { createdAt: 'asc' }, take: 20,
  })

  const context = {
    businessId,
    businessName: business.name,
    vertical: business.vertical,
    city: business.city,
    ownerName: business.ownerName,
    language: customer.language || business.language,
    services: business.services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, pricePaise: s.pricePaise })),
    hours: business.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, closed: h.closed })),
    knowledge: business.knowledge || undefined,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerContext: customer.notes || undefined,
    availableChannels: ['whatsapp'],
    inboundChannel: 'whatsapp' as const,
  }

  const aiResult = await guardedAIReply({
    businessId,
    context,
    history: history.map((m) => ({ role: m.direction === 'inbound' ? 'customer' as const : 'assistant' as const, content: m.content })),
    userMessage: inbound.message,
  })

  const aiReply = aiResult.reply

  // Send first, then store the response (with the provider's message ID for status tracking)
  const sendResult = await sendWhatsAppMessage(
    { to: inbound.phone, message: aiReply, type: 'text' },
    { businessId }
  )

  const outboundMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'outbound',
      sender: 'ai',
      content: aiReply,
      externalId: sendResult.messageId || undefined,
      deliveryStatus: sendResult.success ? 'sent' : 'failed',
      failedAt: sendResult.success ? undefined : new Date(),
      errorMessage: sendResult.success ? undefined : sendResult.error,
    },
  })

  // Queue for retry if send failed
  if (!sendResult.success) {
    const { reliableSend } = await import('@/lib/retry')
    await reliableSend({ businessId, customerId: customer.id, phone: inbound.phone, message: aiReply, type: 'text' })
  }

  // Trigger drips (e.g. new_customer, lead_captured) — fire-and-forget
  const { triggerDripsForEvent } = await import('@/lib/drips')
  triggerDripsForEvent(businessId, 'lead_captured', customer.id).catch(() => null)

  await logWebhookAttempt({
    businessId, channel: 'whatsapp', provider: 'meta',
    messageId, outcome: 'processed',
    metadata: {
      type: 'inbound_message',
      conversationId: conversation.id,
      customerId: customer.id,
      aiReplied: true,
      aiCached: aiResult.cached,
      aiUsage: aiResult.usageRecorded,
    },
  })

  // Invalidate any cached inbox lists so the new conversation / message
  // appears immediately in the owner's UI on next refresh.
  await invalidatePrefix(`conv:${businessId}:`).catch(() => null)

  return NextResponse.json({
    ok: true,
    conversationId: conversation.id,
    messageId: outboundMessage.id,
    aiReplied: true,
    cached: aiResult.cached,
  })
}
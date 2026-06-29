// Per-tenant SMS webhook
//
// URL format: https://yourdomain.com/api/webhook/{businessId}/sms
//
// Twilio / Plivo / MSG91 — all use this same handler. Provider is
// detected from the request shape (form vs JSON, field names).
//
// Handles:
//   - Inbound SMS → AI auto-reply (via messaging-bus)
//   - Delivery status callbacks (sent, delivered, failed) → status update

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { normalizeSMSInbound } from '@/lib/sms'
import { sendOutbound } from '@/lib/messaging-bus'
import { guardedAIReply } from '@/lib/ai-guard'
import {
  checkAndMarkProcessed,
  checkBusinessCanReceiveMessages,
  extractMessageId,
  extractStatusUpdates,
  applyStatusUpdates,
  sanitizeMessageText,
  logWebhookAttempt,
} from '@/lib/webhook-utils'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { invalidatePrefix } from '@/lib/cache'

// Detect provider from request shape + headers
async function readBody(req: NextRequest): Promise<{ provider: 'twilio' | 'plivo' | 'msg91'; data: any }> {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const data: any = {}
    for (const [k, v] of form.entries()) data[k] = v
    return { provider: 'twilio', data }
  }
  const json = await req.json().catch(() => ({}))
  // Heuristic: detect by fields
  if (json.MessageSid || json.SmsSid) return { provider: 'twilio', data: json }
  if (json.MessageUUID) return { provider: 'plivo', data: json }
  return { provider: 'msg91', data: json }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const businessId = params.businessId
  let provider: 'twilio' | 'plivo' | 'msg91' = 'twilio'
  let messageId: string | null = null

  const rl = applyRateLimit(req, businessId, 'api')
  if (rl && !rl.allowed) return rateLimitResponse(rl)

  try {
    const stateCheck = await checkBusinessCanReceiveMessages(businessId)
    if (!stateCheck.ok) {
      return NextResponse.json({ error: `business_${stateCheck.reason}` }, { status: stateCheck.status })
    }

    const body = await readBody(req)
    provider = body.provider

    messageId = extractMessageId(provider, body.data)

    // 1. Delivery status update?
    const statusUpdates = extractStatusUpdates(provider, body.data, 'sms')
    if (statusUpdates.length > 0) {
      await applyStatusUpdates(businessId, statusUpdates)
      await logWebhookAttempt({
        businessId, channel: 'sms', provider, messageId,
        outcome: 'processed',
        metadata: { type: 'status_update', count: statusUpdates.length },
      })
      return NextResponse.json({ ok: true, type: 'status_update', applied: statusUpdates.length })
    }

    // 2. Inbound SMS → AI reply
    if (messageId) {
      const dup = await checkAndMarkProcessed(provider, businessId, messageId)
      if (dup) {
        await logWebhookAttempt({
          businessId, channel: 'sms', provider, messageId,
          outcome: 'duplicate',
        })
        return NextResponse.json({ ok: true, duplicate: true })
      }
    }

    const inbound = normalizeSMSInbound(provider, body.data)
    if (!inbound || !inbound.phone || !inbound.message) {
      return NextResponse.json({ ok: true, skipped: 'not_a_message' })
    }
    inbound.message = sanitizeMessageText(inbound.message)

    // Find or create customer
    let customer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId, phone: inbound.phone } },
    })
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          businessId,
          phone: inbound.phone,
          name: inbound.senderName || 'SMS customer',
          language: (await prisma.business.findUnique({ where: { id: businessId } }))?.language || 'hinglish',
          tags: JSON.stringify(['sms_inbound']),
        },
      })
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: { businessId, customerId: customer.id, channel: 'sms' },
      orderBy: { lastMessageAt: 'desc' },
    })
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { businessId, customerId: customer.id, channel: 'sms', status: 'ai_handling' },
      })
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
      })
    }

    // Save inbound message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        sender: 'customer',
        content: inbound.message,
        externalId: messageId || undefined,
      },
    })

    // Stop drip enrollments (customer replied)
    const { stopAllEnrollments } = await import('@/lib/drips')
    await stopAllEnrollments(customer.id, 'replied').catch(() => null)

    // Generate AI reply (guarded)
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { services: { where: { active: true } }, hours: true },
    })
    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })

    const aiResult = await guardedAIReply({
      businessId,
      context: {
        businessId,
        businessName: business.name,
        vertical: business.vertical,
        city: business.city,
        ownerName: business.ownerName,
        language: customer.language || business.language,
        services: business.services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, pricePaise: s.pricePaise })),
        hours: business.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, closed: h.closed })),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerContext: customer.notes || undefined,
        availableChannels: ['sms', 'whatsapp'],
        inboundChannel: 'sms' as const,
      },
      history: history.map((m) => ({
        role: m.direction === 'inbound' ? 'customer' as const : 'assistant' as const,
        content: m.content,
      })),
      userMessage: inbound.message,
    })

    // Save outbound + send via SMS
    const outbound = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'outbound',
        sender: 'ai',
        content: aiResult.reply,
        deliveryStatus: 'sent',
      },
    })

    const sendResult = await sendOutbound({
      businessId,
      customerId: customer.id,
      channels: ['sms'],
      message: aiResult.reply,
      source: 'ai',
    })

    await logWebhookAttempt({
      businessId, channel: 'sms', provider, messageId,
      outcome: 'processed',
      metadata: {
        type: 'inbound_sms',
        conversationId: conversation.id,
        customerId: customer.id,
        aiCached: aiResult.cached,
      },
    })

    await invalidatePrefix(`conv:${businessId}:`).catch(() => null)

    return NextResponse.json({
      ok: true,
      conversationId: conversation.id,
      messageId: outbound.id,
      sent: sendResult,
      cached: aiResult.cached,
    })
  } catch (err: any) {
    console.error('[SMS webhook] error:', err)
    await logWebhookAttempt({
      businessId, channel: 'sms', provider,
      messageId, outcome: 'error',
      error: err.message,
    }).catch(() => null)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
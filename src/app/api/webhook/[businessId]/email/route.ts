// Per-tenant Email webhook
//
// URL format: https://yourdomain.com/api/webhook/{businessId}/email
//
// Configure this URL in your Resend dashboard (or whichever provider).
// Business ID is in the URL so we don't need payload disambiguation.
//
// Handles both:
//   - Inbound emails  (event: 'email.received')  → AI auto-reply
//   - Delivery events (event: 'email.delivered' | 'email.bounced' | 'email.complained')
//                    → status update on outbound messages
//
// Signature verification:
//   - Resend uses Svix (HMAC-SHA256 base64). Header: svix-id, svix-timestamp, svix-signature
//   - SES uses SNS-signed HTTPS POST (you'd configure a different signature flow;
//     this handler accepts SES events without signature when the secret is unset).

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
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

/** Verify Resend / Svix webhook signature. */
function verifyResendSignature(
  rawBody: string,
  headers: Record<string, string>,
  secret: string
): boolean {
  try {
    const svixId = headers['svix-id']
    const svixTimestamp = headers['svix-timestamp']
    const svixSignature = headers['svix-signature']
    if (!svixId || !svixTimestamp || !svixSignature) return false

    // Reject replays older than 5 minutes
    const ts = parseInt(svixTimestamp, 10)
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false

    const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`
    const expectedBase64 = crypto
      .createHmac('sha256', secret.replace(/^whsec_/, ''))
      .update(signedPayload)
      .digest('base64')

    const provided = svixSignature.split(' ').map((s) => s.split('=')[1] || '')
    return provided.some((p) => {
      if (!p) return false
      try {
        return crypto.timingSafeEqual(Buffer.from(expectedBase64), Buffer.from(p))
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { businessId: string } }
) {
  const businessId = params.businessId
  let messageId: string | null = null

  const rl = applyRateLimit(req, businessId, 'api')
  if (rl && !rl.allowed) return rateLimitResponse(rl)

  try {
    const stateCheck = await checkBusinessCanReceiveMessages(businessId)
    if (!stateCheck.ok) {
      return NextResponse.json({ error: `business_${stateCheck.reason}` }, { status: stateCheck.status })
    }

    const rawBody = await req.text()
    const payload = JSON.parse(rawBody || '{}')

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      const cfg = await prisma.channelConfig.findFirst({
        where: { businessId, channel: 'email', isActive: true },
      })
      let creds: any = null
      if (cfg && cfg.credentials) {
        try {
          const kms = await import('@/lib/kms')
          creds = await kms.decryptJSON<any>(cfg.credentials, businessId)
        } catch {
          creds = null
        }
      }
      const webhookSecret = creds?.webhookSecret || process.env.RESEND_WEBHOOK_SECRET
      if (webhookSecret) {
        const headers: Record<string, string> = {}
        req.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
        if (!verifyResendSignature(rawBody, headers, webhookSecret)) {
          await logWebhookAttempt({
            businessId, channel: 'email', provider: 'resend',
            messageId, outcome: 'signature_failed',
          })
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }
      }
    }

    const eventType = payload.type as string
    messageId = extractMessageId('resend', payload)

    // 1. Delivery status updates (delivered, bounced, complained)
    const statusUpdates = extractStatusUpdates('resend', payload)
    if (statusUpdates.length > 0) {
      await applyStatusUpdates(businessId, statusUpdates)
      await logWebhookAttempt({
        businessId, channel: 'email', provider: 'resend', messageId,
        outcome: 'processed',
        metadata: { type: 'status_update', eventType, count: statusUpdates.length },
      })
      return NextResponse.json({ ok: true, type: 'status_update', applied: statusUpdates.length })
    }

    // 2. Inbound email → AI reply
    if (eventType === 'email.received') {
      // Dedup
      if (messageId) {
        const dup = await checkAndMarkProcessed('resend', businessId, messageId)
        if (dup) {
          await logWebhookAttempt({
            businessId, channel: 'email', provider: 'resend', messageId,
            outcome: 'duplicate',
          })
          return NextResponse.json({ ok: true, duplicate: true })
        }
      }

      const data = payload.data || {}
      const fromEmail: string = (data.from || '').toLowerCase()
      const fromName = data.from_name || (fromEmail.split('<')[0] || '').trim()
      const subject: string = data.subject || '(no subject)'
      const htmlBody: string = data.html || ''
      const textBody: string = sanitizeMessageText(data.text || stripHtml(htmlBody))

      if (!fromEmail || !/@/.test(fromEmail)) {
        return NextResponse.json({ ok: true, skipped: 'no_from' })
      }

      // Find or create customer
      let customer = await prisma.customer.findFirst({
        where: { businessId, email: fromEmail },
      })
      if (!customer) {
        const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { language: true } })
        customer = await prisma.customer.create({
          data: {
            businessId,
            phone: fromEmail, // placeholder for email-only customer (unique key on (businessId, phone))
            email: fromEmail,
            name: fromName || fromEmail.split('@')[0],
            language: biz?.language || 'hinglish',
            tags: JSON.stringify(['email_inbound']),
          },
        })
      }

      // Find or create conversation
      let conversation = await prisma.conversation.findFirst({
        where: { businessId, customerId: customer.id, channel: 'email' },
        orderBy: { lastMessageAt: 'desc' },
      })
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { businessId, customerId: customer.id, channel: 'email', status: 'ai_handling' },
        })
      } else {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
        })
      }

      // Save inbound message — include subject as part of the content
      const content = subject.startsWith('Re:') ? textBody : `Subject: ${subject}\n\n${textBody}`
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'inbound',
          sender: 'customer',
          content,
          externalId: messageId || undefined,
        },
      })

      // AI reply (guarded: budget + rate-limit + concurrent + cost burst + cache)
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: { services: { where: { active: true } }, hours: true },
      })
      if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

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
          customerPhone: customer.email || '',
          customerContext: customer.notes || undefined,
          availableChannels: ['email', 'whatsapp'],
          inboundChannel: 'email' as const,
        },
        history: history.map((m) => ({
          role: m.direction === 'inbound' ? 'customer' as const : 'assistant' as const,
          content: m.content,
        })),
        userMessage: textBody || subject,
      })

      // Save AI reply
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'outbound',
          sender: 'ai',
          content: aiResult.reply,
          deliveryStatus: 'sent',
        },
      })

      // Send via email
      const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`
      const replyHtml = `<div style="white-space: pre-wrap; font-family: -apple-system, sans-serif;">${escapeHtml(aiResult.reply)}</div>`

      const sendResult = await sendOutbound({
        businessId,
        customerId: customer.id,
        channels: ['email'],
        message: '',
        subject: replySubject,
        html: replyHtml,
        text: aiResult.reply,
        source: 'ai',
      })

      await logWebhookAttempt({
        businessId, channel: 'email', provider: 'resend', messageId,
        outcome: 'processed',
        metadata: {
          type: 'inbound_email',
          conversationId: conversation.id,
          customerId: customer.id,
          aiCached: aiResult.cached,
        },
      })

      await invalidatePrefix(`conv:${businessId}:`).catch(() => null)

      return NextResponse.json({
        ok: true,
        conversationId: conversation.id,
        sent: sendResult,
        cached: aiResult.cached,
      })
    }

    // Unknown event — acknowledge with 200 so the provider stops retrying
    return NextResponse.json({ ok: true, ignored: eventType })
  } catch (err: any) {
    console.error('[email webhook] error:', err)
    await logWebhookAttempt({
      businessId, channel: 'email', provider: 'resend',
      messageId, outcome: 'error',
      error: err.message,
    }).catch(() => null)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
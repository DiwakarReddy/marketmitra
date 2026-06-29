// Webhook endpoint for incoming WhatsApp messages
//
// Per-tenant routing:
//   - Each business has their own Meta app / AiSensy account
//   - The webhook URL is the SAME (this endpoint)
//   - When a message arrives, we identify the business by:
//     1. Meta: phone_number_id in the metadata
//     2. AiSensy: businessId in the payload
//     3. 360dialog: channelId in the payload
//   - Then we look up that business's WhatsApp config and verify
//
// Configuration:
//   - Set this URL in your provider dashboard:
//     Meta:    Meta Business Manager → WhatsApp → Configuration → Webhook
//     AiSensy: dashboard.aisensy.com → Settings → Webhooks
//   - Set the verify_token to match what each business has in their config
//     (each business has their own verify_token)
//
// For local dev:
//   ngrok http 3000
//   Then set webhook URL to https://YOUR-ID.ngrok.io/api/whatsapp/webhook

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateAIReply } from '@/lib/ai'
import { sendWhatsAppMessage, verifyWebhookSignature, normalizeInboundWebhook } from '@/lib/whatsapp'
import { decryptJSON } from '@/lib/kms'
import { audit } from '@/lib/audit'
import { isMessageAlreadyProcessed, checkBusinessCanReceiveMessages, extractMessageId, extractStatusUpdates, applyStatusUpdates, sanitizeMessageText, logWebhookAttempt } from '@/lib/webhook-utils'

// GET = webhook verification challenge
// Meta sends this with mode=subscribe, verify_token, challenge
// We need to figure out WHICH business is being verified
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({ ok: true, message: 'MarketMitra WhatsApp webhook is live' })
  }

  // Find the business whose webhookVerifyToken matches
  // We have to check all businesses (no businessId in verification request)
  // Optimized: query ChannelConfig for whatsapp with matching webhookVerifyToken
  const configs = await prisma.channelConfig.findMany({
    where: { channel: 'whatsapp', isActive: true },
  })

  for (const cfg of configs) {
    if (!cfg.credentials) continue
    try {
      const creds = await decryptJSON<Record<string, string>>(cfg.credentials, cfg.businessId)
      if (creds.webhookVerifyToken === token) {
        console.log(`[WhatsApp] Webhook verified for business ${cfg.businessId}`)
        return new NextResponse(challenge, { status: 200 })
      }
    } catch (err) {
      // Skip
    }
  }

  // Fallback: env-var-based (single tenant mode / founder's own)
  const envToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (envToken && token === envToken) {
    console.log('[WhatsApp] Webhook verified via env token (founder mode)')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[WhatsApp] Webhook verification failed — no matching business')
  return NextResponse.json({ error: 'Invalid verify_token' }, { status: 403 })
}

// POST = incoming message handler
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const body = JSON.parse(rawBody)
    const provider = req.headers.get('x-provider') || '' // Optional hint
    const signature =
      req.headers.get('x-hub-signature-256') ||
      req.headers.get('x-aisensy-signature') ||
      req.headers.get('x-api-signature')

    // Step 1: Identify which business this is for
    // Try by phone_number_id (Meta) or by payload fields (others)
    const businessId = await identifyBusiness(body, provider as string)
    if (!businessId) {
      console.warn('[WhatsApp] No business identified for webhook', { keys: Object.keys(body) })
      return NextResponse.json({ ok: true, skipped: 'no_business_match' })
    }

    // Step 1.5: Check business state (deleted/paused)
    const stateCheck = await checkBusinessCanReceiveMessages(businessId)
    if (!stateCheck.ok) {
      return NextResponse.json({ error: `business_${stateCheck.reason}` }, { status: stateCheck.status })
    }

    // Step 1.6: Idempotency check
    const messageId = extractMessageId(provider as string || 'meta', body)
    if (messageId && isMessageAlreadyProcessed(messageId)) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    // Step 2: Load the business's WhatsApp config to get verify token
    const cfg = await prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    })
    if (!cfg) {
      return NextResponse.json({ error: 'Business has no WhatsApp config' }, { status: 404 })
    }

    // Step 3: Verify signature using THIS business's secret.
    // Meta signs webhook payloads with the **app secret** (not the access token).
    // We accept the per-tenant `webhookVerifyToken` field as a custom HMAC key
    // for businesses that want their own signing key.
    if (signature && cfg.credentials) {
      try {
        const creds = await decryptJSON<Record<string, string>>(cfg.credentials, businessId)
        // For Meta: the app secret is the HMAC key. Fall back to webhookVerifyToken
        // for non-Meta providers, and to the access token prefix only as a last resort
        // (and only acceptable in dev).
        const isMeta = (cfg.provider || 'meta') === 'meta'
        const secret = isMeta
          ? (process.env.META_APP_SECRET || creds.appSecret || creds.webhookVerifyToken)
          : (creds.webhookVerifyToken || process.env.WHATSAPP_APP_SECRET)

        if (secret && process.env.NODE_ENV === 'production') {
          if (!verifyPerTenantSignature(rawBody, signature, secret)) {
            await audit({
              businessId, channel: 'whatsapp', action: 'test_failed',
              actor: 'system',
              testResult: 'failed', testError: 'Invalid webhook signature',
              metadata: { ip: req.headers.get('x-forwarded-for') },
            })
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
          }
        }
      } catch (err) {
        console.error('[WhatsApp] Signature verification error:', err)
      }
    }

    // Step 4: Normalize and process
    const detectedProvider = cfg.provider || 'meta'
    const inbound = normalizeInboundWebhook(detectedProvider as any, body)
    if (!inbound) {
      return NextResponse.json({ ok: true, skipped: 'not_a_message' })
    }
    if (!inbound.phone || !inbound.message) {
      return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
    }

    // Force businessId from our routing
    inbound.businessId = businessId

    // Process the message (rest is the same as before)
    return await processInboundMessage(businessId, inbound, detectedProvider, body)
  } catch (err: any) {
    console.error('[WhatsApp webhook] error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Identify which business this webhook is for
async function identifyBusiness(body: any, providerHint: string): Promise<string | null> {
  // Meta Cloud API: phone_number_id in entry[0].changes[0].value.metadata.phone_number_id
  try {
    const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
    if (phoneNumberId) {
      const cfg = await prisma.channelConfig.findFirst({
        where: { channel: 'whatsapp', isActive: true },
      })
      if (cfg) {
        try {
          const c = JSON.parse(cfg.config || '{}')
          if (c.phoneNumberId === phoneNumberId) return cfg.businessId
        } catch {}
      }
      // Fallback: scan all configs
      const all = await prisma.channelConfig.findMany({ where: { channel: 'whatsapp', isActive: true } })
      for (const c of all) {
        try {
          const cfg = JSON.parse(c.config || '{}')
          if (cfg.phoneNumberId === phoneNumberId) return c.businessId
        } catch {}
      }
    }
  } catch {}

  // AiSensy / 360dialog: businessId in payload
  if (body?.businessId) return body.businessId
  if (body?.business_id) return body.business_id
  if (body?.channelId) {
    // 360dialog: phone number maps to business via metadata
    const cfg = await prisma.channelConfig.findFirst({
      where: { channel: 'whatsapp', isActive: true },
    })
    if (cfg) return cfg.businessId
  }

  // Fallback: env-var
  if (process.env.WHATSAPP_DEFAULT_BUSINESS_ID) {
    return process.env.WHATSAPP_DEFAULT_BUSINESS_ID
  }

  return null
}

// Per-tenant HMAC signature verification
function verifyPerTenantSignature(rawBody: string, signature: string, secret: string): boolean {
  const crypto = require('crypto')
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')
  const provided = signature.replace(/^sha256=/, '')

  // Timing-safe compare
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}

async function processInboundMessage(businessId: string, inbound: any, provider: string, rawPayload?: any) {
  // Handle interactive booking button reply: BOOK_<serviceId>_<slotIso>
  if (inbound.interactiveType === 'button' && inbound.interactiveId?.startsWith('BOOK_')) {
    const parts = inbound.interactiveId.split('_')
    if (parts.length >= 3) {
      const serviceId = parts[1]
      const slotIso = parts.slice(2).join('_')  // ISO can contain colons
      try {
        const customer = await prisma.customer.findUnique({
          where: { businessId_phone: { businessId, phone: inbound.phone } },
        })
        if (customer) {
          await handleBookingConfirm(
            businessId,
            inbound.phone,
            slotIso,
            serviceId,
            customer.name,
            inbound.interactiveTitle || 'Booking confirmed'
          )
          // Don't run AI for booking confirmations — they're handled directly
          return NextResponse.json({ ok: true, action: 'booked' })
        }
      } catch (err) {
        console.error('[whatsapp webhook] booking button failed:', err)
      }
    }
  }

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
        businessId,
        customerId: customer.id,
        channel: 'whatsapp',
        status: 'ai_handling',
      },
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
    },
  })

  // CTWA attribution: if inbound came from a Click-to-WhatsApp ad, mark customer
  // source + tag so analytics + drips can filter on it.
  try {
    const { detectCtwaReferral } = await import('@/lib/ctwa')
    const ref = detectCtwaReferral(rawPayload || {})
    if (ref.isCtwa && ref.adId) {
      const existingTags = customer.tags ? JSON.parse(customer.tags) : []
      if (!existingTags.includes('ctwa_lead')) {
        existingTags.push('ctwa_lead')
      }
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          source: 'ctwa',
          tags: JSON.stringify(existingTags),
        },
      })
      // Bump CTWA leads counter on the matching campaign
      await prisma.cTWACampaign.updateMany({
        where: { metaAdId: ref.adId, businessId },
        data: { leads: { increment: 1 } },
      })
      // Create or update Lead record
      await prisma.lead.create({
        data: {
          businessId,
          customerId: customer.id,
          source: 'ctwa',
          status: 'new',
          notes: ref.adId ? `CTWA ad: ${ref.adId}` : 'CTWA',
        },
      })
      // Trigger lead_captured drip
      try {
        const { triggerDripsForEvent } = await import('@/lib/drips')
        await triggerDripsForEvent(businessId, 'lead_captured', customer.id)
      } catch (err) { /* ignore */ }
    }
  } catch (err) {
    console.warn('[whatsapp webhook] CTWA attribution failed:', err)
  }

  // Customer replied → stop all active drip enrollments for them
  // (We don't want automated drips racing against a live conversation.)
  try {
    const { stopAllEnrollments } = await import('@/lib/drips')
    await stopAllEnrollments(customer.id, 'replied')
  } catch (err) {
    console.warn('[whatsapp webhook] failed to stop drips:', err)
  }

  // If this was a new customer, fire 'new_customer' drips
  if (customer.createdAt && Date.now() - new Date(customer.createdAt).getTime() < 60_000) {
    try {
      const { triggerDripsForEvent } = await import('@/lib/drips')
      await triggerDripsForEvent(businessId, 'new_customer', customer.id)
    } catch (err) {
      console.warn('[whatsapp webhook] failed to trigger new_customer drip:', err)
    }
  }

  // Generate AI reply
  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })

  const context = {
    businessName: business.name,
    vertical: business.vertical,
    city: business.city,
    ownerName: business.ownerName,
    language: customer.language || business.language,
    services: business.services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      pricePaise: s.pricePaise,
    })),
    hours: business.hours.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: h.openTime,
      closeTime: h.closeTime,
      closed: h.closed,
    })),
    knowledge: business.knowledge || undefined,
    customerName: customer.name,
    customerPhone: customer.phone,
  }

  const conversationHistory = history
    .filter((m) => m.id !== undefined)
    .map((m) => ({
      role: (m.direction === 'inbound' ? 'customer' : 'assistant') as 'customer' | 'assistant',
      content: m.content,
    }))

  const aiReply = await generateAIReply(context, conversationHistory, inbound.message)

  // Save AI message
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'outbound',
      sender: 'ai',
      content: aiReply,
    },
  })

  // Send AI reply
  const sendResult = await sendWhatsAppMessage(
    { to: inbound.phone, message: aiReply, type: 'text' },
    { businessId }
  )

  if (!sendResult.success) {
    // Queue for retry
    const { reliableSend } = await import('@/lib/retry')
    await reliableSend({
      businessId,
      customerId: customer.id,
      phone: inbound.phone,
      message: aiReply,
      type: 'text',
    })
  }

  // Check if AI reply contains a booking-slots intent marker.
  // Pattern: <booking-slots serviceId="..." date="YYYY-MM-DD"/>
  // When detected, send an interactive slot picker as a follow-up.
  const bookingMatch = aiReply.match(/<booking-slots\s+serviceId="([^"]+)"\s+date="([^"]+)"\s*\/?>/)
  if (bookingMatch) {
    const [, serviceId, date] = bookingMatch
    try {
      const { sendInteractiveToNumber } = await import('@/lib/whatsapp')
      const service = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { name: true, durationMin: true, businessId: true },
      })
      if (service && service.businessId === businessId) {
        // Re-use slots API logic inline
        const dateObj = new Date(date)
        const dayOfWeek = dateObj.getDay()
        const hours = await prisma.businessHour.findUnique({
          where: { businessId_dayOfWeek: { businessId, dayOfWeek } },
        })
        if (hours && !hours.closed) {
          const [openH, openM] = hours.openTime.split(':').map(Number)
          const [closeH, closeM] = hours.closeTime.split(':').map(Number)
          const dayStart = new Date(dateObj); dayStart.setHours(openH, openM, 0, 0)
          const dayEnd = new Date(dateObj); dayEnd.setHours(closeH, closeM, 0, 0)
          const candidates: string[] = []
          let cursor = new Date(dayStart)
          const intervalMin = service.durationMin + 15
          const now = new Date()
          while (cursor.getTime() + service.durationMin * 60000 <= dayEnd.getTime()) {
            if (cursor > now) candidates.push(cursor.toISOString())
            cursor = new Date(cursor.getTime() + intervalMin * 60000)
          }
          const booked = await prisma.appointment.findMany({
            where: { businessId, status: { in: ['booked', 'confirmed'] }, startsAt: { gte: dayStart.toISOString(), lt: dayEnd.toISOString() } },
            select: { startsAt: true, endsAt: true },
          })
          const available = candidates.filter((iso) => {
            const s = new Date(iso).getTime(), e = s + service.durationMin * 60000
            return !booked.some((a) => s < new Date(a.endsAt).getTime() && e > new Date(a.startsAt).getTime())
          }).slice(0, 10)
          if (available.length > 0) {
            const dateLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
            await sendInteractiveToNumber(
              inbound.phone,
              {
                type: 'list',
                headerText: `📅 ${dateLabel}`,
                bodyText: `${service.name} (${service.durationMin} min). Pick a slot:`,
                footerText: 'Tap to confirm',
                sections: [{
                  title: 'Available times',
                  rows: available.map((iso) => {
                    const d = new Date(iso)
                    return {
                      id: `BOOK_${serviceId}_${iso}`,
                      title: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
                      description: `${service.durationMin} min`,
                    }
                  }),
                }],
              },
              { businessId }
            )
          }
        }
      }
    } catch (err) {
      console.warn('[whatsapp webhook] failed to send slot picker:', err)
    }
  }

  return NextResponse.json({ ok: true, conversationId: conversation.id, aiReplied: true })
}

// ============================================================
// BOOKING CONFIRM HELPER (called inline from interactive button handler)
// ============================================================

async function handleBookingConfirm(
  businessId: string,
  phone: string,
  slotIso: string,
  serviceId: string,
  customerName: string,
  interactiveTitle: string
) {
  const slotStart = new Date(slotIso)
  if (Number.isNaN(slotStart.getTime())) throw new Error('Invalid slotIso')

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { name: true, durationMin: true, businessId: true },
  })
  if (!service || service.businessId !== businessId) throw new Error('Service mismatch')

  // Check slot still free
  const conflict = await prisma.appointment.findFirst({
    where: { businessId, serviceId, startsAt: slotStart, status: { in: ['booked', 'confirmed'] } },
  })
  if (conflict) {
    await sendWhatsAppMessage(
      { to: phone, message: `Sorry, that slot was just taken. Please pick another time. 🙏` },
      { businessId }
    )
    return
  }

  let customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone } },
  })
  if (!customer) {
    customer = await prisma.customer.create({
      data: { businessId, phone, name: customerName || 'WhatsApp customer', tags: JSON.stringify(['whatsapp_booking']) },
    })
  }

  const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000)
  await prisma.appointment.create({
    data: {
      businessId,
      customerId: customer.id,
      serviceId,
      startsAt: slotStart,
      endsAt: slotEnd,
      source: 'whatsapp_interactive',
      status: 'booked',
    },
  })

  // Save inbound message + AI-style "system" outbound
  const conversation = await prisma.conversation.findFirst({
    where: { businessId, customerId: customer.id, channel: 'whatsapp' },
    orderBy: { lastMessageAt: 'desc' },
  })
  if (conversation) {
    // Save the actual button title the customer tapped (e.g. "10:30 AM"),
    // not the customer name — that was the bug.
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'inbound',
        sender: 'customer',
        content: interactiveTitle || 'Booking confirmed',
      },
    })
  }

  const dateLabel = slotStart.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })
  const timeLabel = slotStart.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  await sendWhatsAppMessage(
    {
      to: phone,
      message: `✅ Booked! ${service.name} on ${dateLabel} at ${timeLabel}. Reply RESCHEDULE or CANCEL if you need to change.`,
    },
    { businessId }
  )

  await prisma.activity.create({
    data: {
      businessId,
      type: 'appointment_booked',
      actor: 'customer',
      title: 'Booked via WhatsApp',
      description: `${service.name} at ${timeLabel} on ${dateLabel}`,
    },
  })
}
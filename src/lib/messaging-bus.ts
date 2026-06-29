// Unified outbound messaging bus.
//
// Routes a single message to the right channel (or channels) based on
// the customer's preference and the business's available channels.
// Falls back gracefully if the preferred channel is down.
//
// Why this exists:
//   - The AI sometimes needs to send via WhatsApp, sometimes email,
//     sometimes SMS — we want one call site that handles the routing.
//   - Customers can opt into a different channel ("send me bills via
//     email, not WhatsApp").
//   - We need ONE retry / dead-letter queue, ONE place to record
//     delivery status, ONE place to track per-channel costs.
//
// Returns the result of the FIRST successful send. Records attempts
// for every channel tried.

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from './whatsapp'
import { sendSMS } from './sms'
import { sendEmail } from './email'
import { reliableSend } from './retry'

export type Channel = 'whatsapp' | 'sms' | 'email' | 'voice'

export interface OutboundMessage {
  businessId: string
  customerId: string
  channels: Channel[]                 // Channels to try, in preference order
  message: string                     // Body for WhatsApp/SMS
  subject?: string                    // Required for email
  html?: string                       // Required for email
  text?: string                       // Optional for email (plain-text alt)
  /** Optional: a drip / campaign / system message this is part of */
  source?: 'campaign' | 'drip' | 'ai' | 'invoice' | 'booking' | 'broadcast' | 'system'
  /** Don't queue for retry on failure (one-shot transactional) */
  noRetry?: boolean
  /** When set, the message is a templated WhatsApp message */
  templateName?: string
  templateParams?: string[]
  templateLanguage?: string
}

export interface OutboundResult {
  sent: boolean
  channel?: Channel
  messageId?: string
  error?: string
  attempts: Array<{ channel: Channel; success: boolean; error?: string; messageId?: string }>
}

export async function sendOutbound(msg: OutboundMessage): Promise<OutboundResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: msg.customerId },
    select: { phone: true, email: true, optedOut: true, name: true },
  })
  if (!customer) return { sent: false, error: 'customer_not_found', attempts: [] }
  if (customer.optedOut) return { sent: false, error: 'customer_opted_out', attempts: [] }

  const attempts: OutboundResult['attempts'] = []
  for (const channel of msg.channels) {
    try {
      const res = await sendOnChannel(channel, msg, customer)
      attempts.push({ channel, ...res })

      // Record outbound message + delivery status
      await recordOutbound(msg, channel, res)

      if (res.success) {
        return { sent: true, channel, messageId: res.messageId, attempts }
      }
    } catch (err: any) {
      attempts.push({ channel, success: false, error: err.message })
    }
  }

  return { sent: false, error: 'all_channels_failed', attempts }
}

async function sendOnChannel(
  channel: Channel,
  msg: OutboundMessage,
  customer: { phone: string; email: string | null; name: string }
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  switch (channel) {
    case 'whatsapp': {
      if (!customer.phone) return { success: false, error: 'no_phone' }
      const params: any = {
        to: customer.phone,
        message: msg.message,
      }
      if (msg.templateName) {
        params.type = 'template'
        params.templateName = msg.templateName
        params.templateParams = msg.templateParams
        params.templateLanguage = msg.templateLanguage || 'en'
      }
      const r = await sendWhatsAppMessage(params, { businessId: msg.businessId })
      if (!r.success && !msg.noRetry) {
        // Queue for retry
        await reliableSend({
          businessId: msg.businessId,
          customerId: msg.customerId,
          phone: customer.phone,
          message: msg.message,
          type: msg.templateName ? 'template' : 'text',
          templateName: msg.templateName,
          templateParams: msg.templateParams,
        }).catch(() => null)
      }
      return { success: r.success, messageId: r.messageId, error: r.error }
    }
    case 'sms': {
      if (!customer.phone) return { success: false, error: 'no_phone' }
      const r = await sendSMS({ to: customer.phone, message: msg.message }, { businessId: msg.businessId })
      return { success: r.success, messageId: r.messageId, error: r.error }
    }
    case 'email': {
      if (!customer.email) return { success: false, error: 'no_email' }
      if (!msg.subject || !msg.html) return { success: false, error: 'email_missing_subject_or_html' }
      const r = await sendEmail(
        { to: customer.email, subject: msg.subject, html: msg.html, text: msg.text },
        { businessId: msg.businessId }
      )
      return { success: r.success, messageId: r.messageId, error: r.error }
    }
    case 'voice':
      // Voice is async (initiates a call, doesn't deliver a message) — out of scope here
      return { success: false, error: 'voice_requires_initiateAICall' }
  }
}

async function recordOutbound(
  msg: OutboundMessage,
  channel: Channel,
  result: { success: boolean; messageId?: string; error?: string }
) {
  // Best-effort log. For WhatsApp, also store the message in the conversation
  // if there's an active conversation.
  if (channel === 'whatsapp' && result.success) {
    try {
      const conversation = await prisma.conversation.findFirst({
        where: { businessId: msg.businessId, customerId: msg.customerId, channel: 'whatsapp' },
        orderBy: { lastMessageAt: 'desc' },
      })
      if (conversation) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: 'outbound',
            sender: msg.source === 'ai' ? 'ai' : 'owner',
            content: msg.message,
            externalId: result.messageId,
            deliveryStatus: 'sent',
          },
        })
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        })
      }
    } catch (err) {
      // Don't break the send on logging failure
    }
  }

  // Log activity for the business
  try {
    await prisma.activity.create({
      data: {
        businessId: msg.businessId,
        type: `${channel}_outbound`,
        actor: msg.source === 'ai' ? 'ai' : 'owner',
        title: `${channel} message ${result.success ? 'sent' : 'failed'}`,
        description: msg.subject || msg.message.substring(0, 100),
        metadata: msg.customerId ? JSON.stringify({ customerId: msg.customerId }) : undefined,
      },
    })
  } catch {}
}

/**
 * Determine which channels to use for a customer, based on
 * their preferences and the business's available channels.
 */
export async function getChannelsForCustomer(
  businessId: string,
  customerId: string,
  messageType: 'transactional' | 'marketing' = 'transactional'
): Promise<Channel[]> {
  // Default priority: WhatsApp → SMS → Email
  // (You can extend this with per-customer preferences later)
  const channels: Channel[] = []

  // Check which channels are configured for this business
  const { resolveChannel } = await import('./channel-resolver')
  const [wa, sms, email] = await Promise.all([
    resolveChannel(businessId, 'whatsapp'),
    resolveChannel(businessId, 'sms'),
    resolveChannel(businessId, 'email'),
  ])

  if (wa) channels.push('whatsapp')
  if (sms) channels.push('sms')
  if (email) channels.push('email')

  return channels
}

// WhatsApp Business API integration
//
// Supports 3 providers via WHATSAPP_PROVIDER env var:
//   - "meta"      → Meta Cloud API direct (recommended for new projects)
//   - "aisensy"   → AiSensy (India BSP, optional)
//   - "360dialog" → 360dialog (free tier, optional)
//   - (unset)     → MOCK MODE (good for dev/demo, logs only)
//
// All providers normalize to the same SendMessageResult interface.

export type WhatsAppProvider = 'meta' | 'aisensy' | '360dialog' | 'twilio'

export interface SendMessageParams {
  to: string                                // E.164 phone, e.g. +919876543210
  message: string                           // Free-form text (within 24h window) OR template text
  type?: 'text' | 'template'                // Defaults to 'text'
  templateName?: string                     // Required when type='template'
  templateParams?: string[]                 // Template variable values
  templateLanguage?: string                 // ISO code, e.g. 'en' or 'hi'
  templateHeader?: { type: 'image' | 'video' | 'document'; url: string } // Optional media header
}

export interface SendMessageResult {
  success: boolean
  messageId?: string
  error?: string
  mocked?: boolean
  provider?: WhatsAppProvider | 'mock'
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export interface SendMessageContext {
  businessId: string  // Required - we use this to look up per-business creds
}

export async function sendWhatsAppMessage(
  params: SendMessageParams,
  context?: SendMessageContext
): Promise<SendMessageResult> {
  let provider: string = ''
  let useMock = false

  if (context?.businessId) {
    // Multi-tenant: resolve creds from DB
    const { resolveChannel } = await import('./channel-resolver')
    const channel = await resolveChannel(context.businessId, 'whatsapp')

    if (channel) {
      provider = channel.provider || 'meta'
      // Set env vars for the inner functions to read
      if (provider === 'meta') {
        process.env.WHATSAPP_PROVIDER = 'meta'
        process.env.WHATSAPP_ACCESS_TOKEN = channel.credentials.accessToken
        process.env.WHATSAPP_PHONE_NUMBER_ID = channel.config.phoneNumberId
      } else if (provider === 'aisensy' || provider === '360dialog') {
        process.env.WHATSAPP_PROVIDER = provider
        process.env.WHATSAPP_API_KEY = channel.credentials.accessToken
      } else if (provider === 'twilio') {
        process.env.WHATSAPP_PROVIDER = 'twilio'
        process.env.TWILIO_ACCOUNT_SID = channel.credentials.accountSid
        process.env.TWILIO_AUTH_TOKEN = channel.credentials.authToken
        process.env.TWILIO_WHATSAPP_FROM = channel.config.phoneNumber || channel.credentials.whatsappFrom
      }
    } else {
      useMock = true
    }
  } else {
    // Fallback: env vars
    provider = (process.env.WHATSAPP_PROVIDER || '') as string
    if (!provider) useMock = true
  }

  if (useMock) {
    return mockSend(params)
  }

  // If provider is set but no credentials, fall back to mock
  if (provider === 'meta' && (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID)) {
    console.warn('[WhatsApp] META provider selected but credentials missing — falling back to mock')
    return mockSend(params)
  }
  if ((provider === 'aisensy' || provider === '360dialog') && !process.env.WHATSAPP_API_KEY) {
    return mockSend(params)
  }
  if (provider === 'twilio' && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN)) {
    return mockSend(params)
  }

  try {
    switch (provider) {
      case 'meta':
        return await sendViaMeta(params)
      case 'aisensy':
        return await sendViaAiSensy(params)
      case '360dialog':
        return await sendVia360Dialog(params)
      case 'twilio':
        return await sendViaTwilio(params)
      default:
        return { success: false, error: `Unknown provider: ${provider}`, provider: 'mock' }
    }
  } catch (err) {
    console.error(`[WhatsApp ${provider}] error:`, err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      provider: (provider as any) || 'mock',
    }
  }
}

// ============================================================
// META CLOUD API (direct) — recommended for new projects
// ============================================================
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Setup:
//  1. Create Meta Business account at business.facebook.com
//  2. Create WhatsApp Business App
//  3. Add a phone number
//  4. Generate a permanent system user access token
//  5. Set webhook URL to https://your-domain.com/api/whatsapp/webhook
//
// Env:
//   WHATSAPP_PROVIDER="meta"
//   WHATSAPP_ACCESS_TOKEN="EAAxxxxx..."   (system user token)
//   WHATSAPP_PHONE_NUMBER_ID="1234567890"
//   WHATSAPP_BUSINESS_ACCOUNT_ID="9876543210"  (optional)

async function sendViaMeta(params: SendMessageParams): Promise<SendMessageResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0'
  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`

  const to = params.to.replace(/\D/g, '') // strip non-digits; Meta expects country-code number

  let body: any

  if (params.type === 'template' && params.templateName) {
    // Template message (required for outbound / reactivation)
    const components: any[] = []

    if (params.templateHeader) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: params.templateHeader.type,
            [params.templateHeader.type]: { link: params.templateHeader.url },
          },
        ],
      })
    }

    if (params.templateParams && params.templateParams.length > 0) {
      components.push({
        type: 'body',
        parameters: params.templateParams.map((p) => ({ type: 'text', text: p })),
      })
    }

    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.templateLanguage || 'en' },
        components,
      },
    }
  } else {
    // Free-form text message (only valid within 24h service window after customer messaged you)
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: params.message, preview_url: false },
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (response.ok && data.messages?.[0]?.id) {
    return { success: true, messageId: data.messages[0].id, provider: 'meta' }
  }

  return {
    success: false,
    error: data.error?.message || `Meta API returned ${response.status}`,
    provider: 'meta',
  }
}

// ============================================================
// AISENSY (optional India BSP)
// ============================================================
// Docs: https://docs.aisensy.com
//
// Env:
//   WHATSAPP_PROVIDER="aisensy"
//   WHATSAPP_API_KEY="your-aisensy-api-key"

async function sendViaAiSensy(params: SendMessageParams): Promise<SendMessageResult> {
  const url = process.env.WHATSAPP_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2'
  const to = params.to.replace(/\D/g, '')

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.WHATSAPP_API_KEY,
      campaignName: params.templateName || 'marketmitra_msg',
      destination: to,
      userName: 'MarketMitra',
      templateParams: params.templateParams || [params.message],
      source: 'MarketMitra',
      media: {},
      buttons: [],
      carouselCards: [],
      location: {},
    }),
  })

  const data = await response.json()

  if (data.status === 'success') {
    return { success: true, messageId: data.data?.messageId, provider: 'aisensy' }
  }
  return {
    success: false,
    error: data.message || 'AiSensy API error',
    provider: 'aisensy',
  }
}

// ============================================================
// 360DIALOG (optional, free tier available)
// ============================================================
// Docs: https://docs.360dialog.com
//
// Env:
//   WHATSAPP_PROVIDER="360dialog"
//   WHATSAPP_API_KEY="your-360dialog-api-key"

async function sendVia360Dialog(params: SendMessageParams): Promise<SendMessageResult> {
  const url = process.env.WHATSAPP_API_URL || 'https://waba.360dialog.io/v1/messages'
  const to = params.to.replace(/\D/g, '')

  let body: any

  if (params.type === 'template' && params.templateName) {
    body = {
      to,
      type: 'template',
      template: {
        namespace: process.env.WHATSAPP_TEMPLATE_NAMESPACE,
        name: params.templateName,
        language: { code: params.templateLanguage || 'en', policy: 'deterministic' },
        components: params.templateParams
          ? [
              {
                type: 'body',
                parameters: params.templateParams.map((p) => ({ type: 'text', text: p })),
              },
            ]
          : [],
      },
    }
  } else {
    body = {
      to,
      type: 'text',
      text: { body: params.message },
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'D360-API-KEY': process.env.WHATSAPP_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await response.json()

  if (response.ok && data.messages?.[0]?.id) {
    return { success: true, messageId: data.messages[0].id, provider: '360dialog' }
  }
  return {
    success: false,
    error: data.error?.text || data.message || `360dialog returned ${response.status}`,
    provider: '360dialog',
  }
}

// ============================================================
// MOCK MODE (no provider configured)
// ============================================================

function mockSend(params: SendMessageParams): SendMessageResult {
  console.log(
    `[WhatsApp MOCK] ${params.type === 'template' ? `template: ${params.templateName}` : 'text'} → ${params.to}`,
    params.message.substring(0, 80)
  )
  return {
    success: true,
    messageId: `mock_${Date.now()}`,
    mocked: true,
    provider: 'mock',
  }
}

// ============================================================
// WEBHOOK SIGNATURE VERIFICATION (per provider)
// ============================================================

export function verifyWebhookSignature(
  provider: WhatsAppProvider,
  body: string,
  signature: string | null
): boolean {
  if (!signature) return false

  try {
    switch (provider) {
      case 'meta': {
        // Meta uses HMAC-SHA256 with app secret
        const appSecret = process.env.WHATSAPP_APP_SECRET
        if (!appSecret) return process.env.NODE_ENV === 'development'
        const crypto = require('crypto')
        const expected = crypto.createHmac('sha256', appSecret).update(body).digest('hex')
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
      }
      case 'aisensy':
      case '360dialog':
        // These providers don't always sign webhooks; accept in dev, require explicit secret in prod
        return process.env.NODE_ENV === 'development'
      default:
        return false
    }
  } catch (err) {
    return false
  }
}

// ============================================================
// INCOMING MESSAGE NORMALIZER
// ============================================================
// Different providers send different webhook formats.
// This function extracts { phone, message, senderName, businessId? } from any of them.

export interface NormalizedInbound {
  phone: string
  message: string
  senderName: string
  businessId?: string
  messageId?: string
  timestamp?: string | number
}

export function normalizeInboundWebhook(
  provider: WhatsAppProvider | '',
  payload: any
): NormalizedInbound | null {
  try {
    switch (provider) {
      case 'meta':
        return normalizeMetaInbound(payload)
      case 'aisensy':
        return normalizeAiSensyInbound(payload)
      case '360dialog':
        return normalize360DialogInbound(payload)
      case 'twilio':
        return normalizeTwilioInbound(payload)
      default:
        // Mock / unknown provider
        return {
          phone: payload.phone || payload.phoneNumber || payload.from || '',
          message: payload.message || payload.text || payload.body || '',
          senderName: payload.name || payload.senderName || 'Customer',
        }
    }
  } catch (err) {
    console.error('[WhatsApp] normalize inbound error:', err)
    return null
  }
}

function normalizeMetaInbound(payload: any): NormalizedInbound | null {
  // Meta Cloud API format:
  // { entry: [{ changes: [{ value: { messages: [{ from, text: { body }, id, timestamp }], contacts: [{ profile: { name } }] } }] }] }
  const entry = payload?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const message = value?.messages?.[0]
  const contact = value?.contacts?.[0]

  if (!message) return null

  return {
    phone: `+${message.from}`,
    message: message.text?.body || message.interactive?.button_reply?.title || '',
    senderName: contact?.profile?.name || 'Customer',
    messageId: message.id,
    timestamp: message.timestamp,
    // businessId is configured at app level for Meta — set in env
    businessId: process.env.WHATSAPP_DEFAULT_BUSINESS_ID,
  }
}

function normalizeAiSensyInbound(payload: any): NormalizedInbound | null {
  if (!payload?.phone || !payload?.message) return null
  return {
    phone: payload.phone.startsWith('+') ? payload.phone : `+${payload.phone}`,
    message: payload.message,
    senderName: payload.name || 'Customer',
    businessId: payload.businessId,
  }
}

function normalize360DialogInbound(payload: any): NormalizedInbound | null {
  // 360dialog format is similar to Meta
  const message = payload?.messages?.[0]
  const contact = payload?.contacts?.[0]
  if (!message) return null
  return {
    phone: `+${message.from}`,
    message: message.text?.body || '',
    senderName: contact?.profile?.name || 'Customer',
    messageId: message.id,
    timestamp: message.timestamp,
    businessId: process.env.WHATSAPP_DEFAULT_BUSINESS_ID,
  }
}
// Twilio WhatsApp inbound webhook (form-encoded payload)
// {
//   MessageSid: 'SMxxxxx',
//   From: 'whatsapp:+919876543210',
//   To: 'whatsapp:+14155238886',
//   Body: 'Hello',
//   ProfileName: 'Customer Name',
//   SmsStatus: 'received',
//   ...
// }
function normalizeTwilioInbound(payload: any): NormalizedInbound | null {
  if (!payload?.MessageSid || !payload?.Body) return null
  // Phone may be like 'whatsapp:+919876543210' — strip prefix
  const fromRaw = payload.From || ''
  const phone = fromRaw.replace(/^whatsapp:/i, '').replace(/^\+/, '')
  return {
    phone,
    message: payload.Body,
    senderName: payload.ProfileName || payload.From?.replace('whatsapp:', '') || 'Customer',
    messageId: payload.MessageSid,
    timestamp: payload.DateSent ? new Date(payload.DateSent).getTime() : Date.now(),
    businessId: process.env.WHATSAPP_DEFAULT_BUSINESS_ID,
  }
}

// ============================================================
// TWILIO WHATSAPP
// ============================================================
// Docs: https://www.twilio.com/docs/whatsapp/api
async function sendViaTwilio(params: SendMessageParams): Promise<SendMessageResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

  if (!accountSid || !authToken) {
    return { success: false, error: 'Twilio credentials missing', provider: 'twilio' }
  }

  const to = params.to.replace(/\D/g, '')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const formBody = new URLSearchParams()
  formBody.append('From', fromNumber)
  formBody.append('To', `whatsapp:+${to}`)
  if (params.type === 'template' && params.templateName) {
    formBody.append('Body', params.templateParams?.join(' ') || '')
    formBody.append('ContentSid', params.templateName)
  } else {
    formBody.append('Body', params.message)
  }

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    })

    const data: any = await response.json()

    if (response.ok && data.sid) {
      return { success: true, messageId: data.sid, provider: 'twilio' }
    }
    return {
      success: false,
      error: data.message || `Twilio returned ${response.status}`,
      provider: 'twilio',
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Twilio send failed',
      provider: 'twilio',
    }
  }
}

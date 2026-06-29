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
  // Multi-tenant: resolve creds from DB once, pass them through the call chain
  // (DO NOT mutate process.env — that's a race condition across concurrent
  // requests in serverless / multi-tenant scenarios).
  let provider: string = ''
  let resolvedCreds: Record<string, any> = {}
  let resolvedConfig: Record<string, any> = {}

  if (context?.businessId) {
    const { resolveChannel } = await import('./channel-resolver')
    const channel = await resolveChannel(context.businessId, 'whatsapp')
    if (channel) {
      provider = channel.provider || 'meta'
      resolvedCreds = channel.credentials || {}
      resolvedConfig = channel.config || {}
    }
  } else {
    // Single-tenant fallback: env vars
    provider = (process.env.WHATSAPP_PROVIDER || '') as string
  }

  if (!provider) {
    return mockSend(params)
  }

  // Credential checks (per provider, per resolution path)
  if (provider === 'meta' && (!resolvedCreds.accessToken || !resolvedConfig.phoneNumberId)) {
    console.warn('[WhatsApp] META provider selected but credentials missing — falling back to mock')
    return mockSend(params)
  }
  if ((provider === 'aisensy' || provider === '360dialog') && !resolvedCreds.accessToken) {
    return mockSend(params)
  }
  if (provider === 'twilio' && (!resolvedCreds.accountSid || !resolvedCreds.authToken)) {
    return mockSend(params)
  }

  try {
    switch (provider) {
      case 'meta':
        return await sendViaMeta(params, resolvedCreds.accessToken, resolvedConfig.phoneNumberId)
      case 'aisensy':
        return await sendViaAiSensy(params, resolvedCreds.accessToken)
      case '360dialog':
        return await sendVia360Dialog(params, resolvedCreds.accessToken, resolvedConfig.templateNamespace)
      case 'twilio':
        return await sendViaTwilio(params, resolvedCreds.accountSid, resolvedCreds.authToken, resolvedConfig.phoneNumber || resolvedCreds.whatsappFrom)
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

async function sendViaMeta(params: SendMessageParams, accessToken?: string, phoneNumberId?: string): Promise<SendMessageResult> {
  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'Meta credentials missing', provider: 'meta' }
  }
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

async function sendViaAiSensy(params: SendMessageParams, apiKey?: string): Promise<SendMessageResult> {
  if (!apiKey) {
    return { success: false, error: 'AiSensy API key missing', provider: 'aisensy' }
  }
  const url = process.env.WHATSAPP_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2'
  const to = params.to.replace(/\D/g, '')

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
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

async function sendVia360Dialog(params: SendMessageParams, apiKey?: string, templateNamespace?: string): Promise<SendMessageResult> {
  if (!apiKey) {
    return { success: false, error: '360dialog API key missing', provider: '360dialog' }
  }
  const url = process.env.WHATSAPP_API_URL || 'https://waba.360dialog.io/v1/messages'
  const to = params.to.replace(/\D/g, '')
  const namespace = templateNamespace || process.env.WHATSAPP_TEMPLATE_NAMESPACE

  let body: any

  if (params.type === 'template' && params.templateName) {
    body = {
      to,
      type: 'template',
      template: {
        namespace,
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
      'D360-API-KEY': apiKey,
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
  // Interactive reply metadata
  interactiveType?: 'button' | 'list' | 'flow'
  interactiveId?: string    // button/list id (e.g. "BOOK_2026-06-30T10:00:00Z")
  interactiveTitle?: string // human-readable title of the choice
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

  let interactiveType: NormalizedInbound['interactiveType']
  let interactiveId: string | undefined
  let interactiveTitle: string | undefined
  let text = ''
  if (message.text?.body) {
    text = message.text.body
  } else if (message.interactive?.button_reply) {
    interactiveType = 'button'
    interactiveId = message.interactive.button_reply.id
    interactiveTitle = message.interactive.button_reply.title
    text = interactiveTitle || ''
  } else if (message.interactive?.list_reply) {
    interactiveType = 'list'
    interactiveId = message.interactive.list_reply.id
    interactiveTitle = message.interactive.list_reply.title
    text = interactiveTitle || ''
  } else if (message.button?.text) {
    // Quick reply (deprecated but still possible)
    interactiveType = 'button'
    interactiveId = message.button.payload
    interactiveTitle = message.button.text
    text = message.button.text
  }

  return {
    phone: `+${message.from}`,
    message: text,
    senderName: contact?.profile?.name || 'Customer',
    messageId: message.id,
    timestamp: message.timestamp,
    interactiveType,
    interactiveId,
    interactiveTitle,
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
async function sendViaTwilio(params: SendMessageParams, accountSid?: string, authToken?: string, fromNumber?: string): Promise<SendMessageResult> {
  if (!accountSid || !authToken) {
    return { success: false, error: 'Twilio credentials missing', provider: 'twilio' }
  }

  const sender = fromNumber || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
  const to = params.to.replace(/\D/g, '')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

  const formBody = new URLSearchParams()
  formBody.append('From', sender)
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

// ============================================================
// INTERACTIVE MESSAGES (slot pickers, confirmations, CTAs)
// ============================================================
// Used for in-chat booking flows: send a list of available slots as buttons
// or list items, then handle the reply to confirm/cancel.

export interface InteractiveButton {
  id: string              // unique id, max 256 chars; webhook will receive this
  title: string           // max 20 chars (button) or 24 chars (CTA)
}

export interface InteractiveSection {
  title?: string
  rows: InteractiveButton[]
}

export interface InteractivePayload {
  type: 'button' | 'list' | 'cta_url'
  headerText?: string
  bodyText: string          // required
  footerText?: string
  buttons?: InteractiveButton[]  // for type='button' (max 3)
  sections?: InteractiveSection[] // for type='list'
  ctaUrl?: string           // for type='cta_url'
  ctaLabel?: string
}

export async function sendInteractiveMessage(
  payload: InteractivePayload,
  context?: SendMessageContext
): Promise<SendMessageResult & { payloadId?: string }> {
  // DEPRECATED: this was previously a no-op stub. The actual send now happens via
  // sendInteractiveToNumber(to, payload, context). Keep this as a thin alias that
  // surfaces a clear error so callers that didn't pass `to` get a useful message.
  if (!context?.businessId) {
    return { success: false, error: 'businessId required for interactive messages', provider: 'meta' }
  }
  return {
    success: false,
    error: 'sendInteractiveMessage() requires sendInteractiveToNumber() instead — pass a `to` phone number',
    provider: 'meta',
  }
}

/**
 * Low-level: send an interactive message to a specific phone number.
 * Returns the Meta API response including messageId.
 */
export async function sendInteractiveToNumber(
  to: string,
  payload: InteractivePayload,
  context: SendMessageContext
): Promise<SendMessageResult> {
  if (!context?.businessId) return { success: false, error: 'businessId required', provider: 'meta' }
  const { resolveChannel } = await import('./channel-resolver')
  const channel = await resolveChannel(context.businessId, 'whatsapp')
  if (!channel || channel.provider !== 'meta' || !channel.credentials?.accessToken || !channel.config?.phoneNumberId) {
    return { success: false, error: 'Meta Cloud API not configured', provider: 'meta' }
  }

  let interactive: any
  if (payload.type === 'button') {
    interactive = {
      type: 'button',
      body: { text: payload.bodyText.slice(0, 1024) },
      action: {
        buttons: (payload.buttons || []).slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    }
  } else if (payload.type === 'list') {
    interactive = {
      type: 'list',
      body: { text: payload.bodyText.slice(0, 1024) },
      action: {
        button: 'Choose',
        sections: (payload.sections || []).slice(0, 10).map((s) => ({
          title: s.title?.slice(0, 24) || 'Options',
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
          })),
        })),
      },
    }
  } else if (payload.type === 'cta_url') {
    interactive = {
      type: 'cta_url',
      body: { text: payload.bodyText.slice(0, 1024) },
      action: {
        name: 'cta_url',
        parameters: { display_text: payload.ctaLabel?.slice(0, 20) || 'Open', url: payload.ctaUrl || '' },
      },
    }
  } else {
    return { success: false, error: 'Unknown interactive type', provider: 'meta' }
  }
  if (payload.headerText) interactive.header = { type: 'text', text: payload.headerText.slice(0, 60) }
  if (payload.footerText) interactive.footer = { text: payload.footerText.slice(0, 60) }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0'
  const url = `https://graph.facebook.com/${apiVersion}/${channel.config.phoneNumberId}/messages`

  const body = {
    messaging_product: 'whatsapp',
    to: to.replace(/\D/g, ''),
    type: 'interactive',
    interactive,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${channel.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok && data.messages?.[0]?.id) {
      return { success: true, messageId: data.messages[0].id, provider: 'meta' }
    }
    return {
      success: false,
      error: data.error?.message || `Meta returned ${res.status}`,
      provider: 'meta',
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Interactive send failed',
      provider: 'meta',
    }
  }
}

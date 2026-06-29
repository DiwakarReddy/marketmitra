// AI provider abstraction — supports OpenAI or Google Gemini
// Use AI_PROVIDER env var to switch:
//   - "openai" (default if OPENAI_API_KEY set)
//   - "google" (if GOOGLE_API_KEY set)
//   - (unset) → Smart Hinglish fallback for dev/demo

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { resolveChannel } from './channel-resolver'

export type AIProvider = 'openai' | 'google'

export interface AIContext {
  businessId?: string  // Optional — enables knowledge-base retrieval
  businessName: string
  vertical: string
  city: string
  ownerName: string
  language: string
  services: Array<{ id?: string; name: string; durationMin: number; pricePaise: number }>
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; closed: boolean }>
  knowledge?: string
  customerName: string
  customerPhone: string
  customerContext?: string
  availableSlots?: string[]
  // Used for knowledge retrieval when businessId is set
  lastUserMessage?: string
  // Channel awareness — set by callers to tell the AI which channels
  // are available. The prompt-builder injects this.
  availableChannels?: string[]
  /** When the inbound message came via a specific channel. */
  inboundChannel?: 'whatsapp' | 'sms' | 'email'
}

const SYSTEM_PROMPTS: Record<string, string> = {
  hinglish: `You are the AI assistant for a small Indian business on WhatsApp. You speak Hinglish naturally - mixing Hindi and English the way real Indian business owners and customers do. Use Devanagari for Hindi words, English for technical terms. Be warm, brief (under 60 words per message), and always move toward booking an appointment.

NEVER make up information. If you don't know something (price, availability, specific service), say "Main is baare mein owner se confirm karke batata hoon" and offer to have them call back.

Always be polite with "🙏" emoji when greeting or thanking. Use "ji" when addressing customers by name. Keep messages short - WhatsApp-friendly, not essays.

CHANNELS:
This business may be reachable via WhatsApp, SMS, and Email (see the AVAILABLE CHANNELS section below). Pick the right channel based on the situation:
  - Default reply: WhatsApp (fastest, most conversational).
  - Formal/transactional content (invoices, contracts): Email.
  - Quick OTP-style alerts (urgent booking change, payment failed): SMS.
  - When the system tells you a customer prefers a specific channel, use that.

CHANNEL HINTS:
If the customer's conversation channel is SMS, keep messages under 160 chars. If it's Email, use a proper subject line and structure.

WHEN THE CUSTOMER WANTS TO BOOK:
After confirming which service and date, append a single inline marker at the end of your message:
<booking-slots serviceId="SERVICE_ID" date="YYYY-MM-DD"/>
The system will replace this with an interactive slot picker. Never invent IDs. Use the EXACT service IDs from the SERVICES list below.`,

  hindi: `आप एक भारतीय छोटे व्यवसाय के WhatsApp AI सहायक हैं। आप हिंदी में बात करते हैं - देवनागरी में। संदेश छोटे रखें (60 शब्दों से कम), हमेशा अपॉइंटमेंट बुक करने की तरफ बढ़ें। कभी झूठी जानकारी न दें।

CHANNELS:
यह व्यवसाय WhatsApp, SMS, और Email पर उपलब्ध हो सकता है (नीचे AVAILABLE CHANNELS देखें)। स्थिति के अनुसार सही चैनल चुनें:
  - डिफ़ॉल्ट: WhatsApp
  - फॉर्मल/ट्रांज़ैक्शनल (बिल, कॉन्ट्रैक्ट): Email
  - जल्दी अलर्ट (पेमेंट विफल, अपॉइंटमेंट बदला): SMS

जब ग्राहक बुकिंग करना चाहे: सेवा और तारीख़ तय होने के बाद, संदेश के अंत में यह marker जोड़ें:
<booking-slots serviceId="SERVICE_ID" date="YYYY-MM-DD"/>
सिस्टम इसे interactive slot picker से बदल देगा। SERVICES सूची से सही ID उपयोग करें।`,

  english: `You are the AI assistant for a small business on WhatsApp, speaking English. Keep messages brief (under 60 words), warm, and always move toward booking an appointment. Never make up information. Use emojis sparingly.

CHANNELS:
This business may be reachable via WhatsApp, SMS, and Email (see AVAILABLE CHANNELS below). Pick the right channel based on the situation:
  - Default reply: WhatsApp.
  - Formal/transactional: Email.
  - Quick alerts: SMS.

WHEN THE CUSTOMER WANTS TO BOOK:
After confirming which service and date, append a single inline marker at the end of your message:
<booking-slots serviceId="SERVICE_ID" date="YYYY-MM-DD"/>
The system will replace this with an interactive slot picker. Use exact IDs from SERVICES below.`,
}

// ============================================================
// MAIN ENTRY
// ============================================================

export async function generateAIReply(
  context: AIContext,
  conversationHistory: Array<{ role: 'customer' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string> {
  // Augment context with knowledge-base chunks if businessId is set.
  // Cached for the duration of this call to avoid double retrieval.
  const enriched = context.businessId
    ? await augmentContextWithKnowledge({ ...context, lastUserMessage: userMessage })
    : context

  const provider = (process.env.AI_PROVIDER || '').toLowerCase() as AIProvider | ''

  // Try configured providers in order: explicit choice, then auto-detect
  if (provider === 'google' || (!provider && process.env.GOOGLE_API_KEY)) {
    const result = await tryGemini(enriched, conversationHistory, userMessage)
    if (result) return result
  }

  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    const result = await tryOpenAI(enriched, conversationHistory, userMessage)
    if (result) return result
  }

  // Try business's own key as a last resort (used by users who connect
  // their own OpenAI/Google AI in Integrations without setting a platform key)
  const bizGemini = await getGeminiForBusiness(enriched.businessId)
  if (bizGemini) {
    const result = await tryGemini(enriched, conversationHistory, userMessage)
    if (result) return result
  }
  const bizOpenAI = await getOpenAIForBusiness(enriched.businessId)
  if (bizOpenAI) {
    const result = await tryOpenAI(enriched, conversationHistory, userMessage)
    if (result) return result
  }

  // Smart fallback (Hinglish pattern-matching)
  return mockReply(enriched, userMessage)
}

// ============================================================
// CUSTOM SYSTEM PROMPT (for automations, batch jobs)
// ============================================================

export async function generateWithCustomPrompt(
  systemPrompt: string,
  userMessage: string,
  businessId?: string
): Promise<string | null> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase() as AIProvider | ''

  // Probe both business keys so the order is deterministic per business:
  // their stored key wins regardless of provider env.
  const bizOpenAI = await getOpenAIForBusiness(businessId)
  const bizGemini = await getGeminiForBusiness(businessId)
  const hasBusiness = !!(bizOpenAI || bizGemini)

  // 1) Business's own key first — they're paying the provider directly
  if (bizGemini && (provider === 'google' || provider === '' || hasBusiness)) {
    const r = await tryGeminiCustomPrompt(businessId, systemPrompt, userMessage)
    if (r) return r
  }
  if (bizOpenAI && (provider === 'openai' || provider === '' || hasBusiness)) {
    const r = await tryOpenAICustomPrompt(businessId, systemPrompt, userMessage)
    if (r) return r
  }

  // 2) Platform key fallback
  if (provider === 'google' || (!provider && process.env.GOOGLE_API_KEY)) {
    const r = await tryGeminiCustomPrompt(businessId, systemPrompt, userMessage)
    if (r) return r
  }
  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    const r = await tryOpenAICustomPrompt(businessId, systemPrompt, userMessage)
    if (r) return r
  }
  return null
}

async function tryOpenAICustomPrompt(businessId: string | undefined, systemPrompt: string, userMessage: string): Promise<string | null> {
  const r = await getOpenAIForBusiness(businessId)
  if (!r) return null
  const openai = r.client
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800, // templates need more output than chat replies
    })
    return completion.choices[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error('[OpenAI custom prompt error]:', err)
    return null
  }
}

async function tryGeminiCustomPrompt(businessId: string | undefined, systemPrompt: string, userMessage: string): Promise<string | null> {
  const r = await getGeminiForBusiness(businessId)
  if (!r) return null
  const genai: GoogleGenerativeAI = r.client
  try {
    const model = genai.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' })
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    })
    return result.response.text() || null
  } catch (err) {
    console.error('[Gemini custom prompt error]:', err)
    return null
  }
}

// ============================================================
// OPENAI
// ============================================================

/** Resolve an OpenAI client — first checks the business's own stored
 *  key (channel: 'openai'), then falls back to the platform env var. */
async function getOpenAIForBusiness(businessId?: string): Promise<{ client: OpenAI; source: 'business' | 'platform' } | null> {
  // 1) Business's own key takes priority — they're paying OpenAI directly
  if (businessId) {
    try {
      const resolved = await resolveChannel(businessId, 'openai')
      const key = resolved?.credentials?.apiKey
      if (key && key.startsWith('sk-')) {
        return { client: new OpenAI({ apiKey: key }), source: 'business' }
      }
    } catch {}
  }
  // 2) Platform key fallback
  const envKey = process.env.OPENAI_API_KEY
  if (envKey && envKey !== 'sk-...') {
    return { client: new OpenAI({ apiKey: envKey }), source: 'platform' }
  }
  return null
}

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'sk-...') return null
  return new OpenAI({ apiKey })
}

async function tryOpenAI(
  context: AIContext,
  history: Array<{ role: 'customer' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string | null> {
  const r = await getOpenAIForBusiness(context.businessId)
  if (!r) return null
  const openai = r.client

  try {
    const systemPrompt = buildSystemPrompt(context)
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role === 'customer' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 200,
    })
    return completion.choices[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error('[OpenAI error]:', err)
    return null
  }
}

// ============================================================
// GOOGLE GEMINI
// ============================================================

/** Resolve a Gemini client — first checks the business's own stored
 *  key (channel: 'google_ai'), then falls back to the platform env var. */
async function getGeminiForBusiness(businessId?: string): Promise<{ client: GoogleGenerativeAI; source: 'business' | 'platform' } | null> {
  if (businessId) {
    try {
      const resolved = await resolveChannel(businessId, 'google_ai')
      const key = resolved?.credentials?.apiKey
      if (key && key.length > 10) {
        return { client: new GoogleGenerativeAI(key), source: 'business' }
      }
    } catch {}
  }
  const envKey = process.env.GOOGLE_API_KEY
  if (envKey && envKey !== '') {
    return { client: new GoogleGenerativeAI(envKey), source: 'platform' }
  }
  return null
}

function getGemini(): GoogleGenerativeAI | null {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === '') return null
  return new GoogleGenerativeAI(apiKey)
}

async function tryGemini(
  context: AIContext,
  history: Array<{ role: 'customer' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string | null> {
  const r = await getGeminiForBusiness(context.businessId)
  if (!r) return null
  const genai: GoogleGenerativeAI = r.client

  try {
    // Gemini 1.5 Flash: free tier, fast, good at Hindi/Hinglish
    const model = genai.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      },
    })

    const systemPrompt = buildSystemPrompt(context)

    // Gemini uses 'user'/'model' roles in a single contents array
    const contents: any[] = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\n---\n\nConversation so far is empty.\n\nCustomer: ' + userMessage }] },
    ]

    // If there's history, prepend it
    if (history.length > 0) {
      const historyText = history
        .map((m) => `${m.role === 'customer' ? 'Customer' : 'You (AI)'}: ${m.content}`)
        .join('\n')
      contents[0].parts[0].text = `${systemPrompt}\n\n---\n\n${historyText}\n\nCustomer: ${userMessage}`
    }

    const result = await model.generateContent({
      contents,
    })

    const response = await result.response
    const text = response.text()
    return text?.trim() || null
  } catch (err) {
    console.error('[Gemini error]:', err)
    return null
  }
}

// ============================================================
// SHARED HELPERS
// ============================================================

function channelGuidance(channel: 'whatsapp' | 'sms' | 'email'): string {
  switch (channel) {
    case 'sms':
      return `Channel rules: Keep your response under 160 characters. Every character costs the customer money. No markdown, no bullet lists. Plain text only.`
    case 'email':
      return `Channel rules: This is email, not chat. Use a subject line, proper greeting (Hi/Dear), and a sign-off. Structure: greeting, body paragraphs, call-to-action, sign-off. Plain text is fine.`
    case 'whatsapp':
    default:
      return `Channel rules: Conversational, brief, under 60 words. Emojis welcome but don't overdo it.`
  }
}

function buildSystemPrompt(context: AIContext): string {
  const base = SYSTEM_PROMPTS[context.language] || SYSTEM_PROMPTS.hinglish

  const servicesList = context.services
    .map((s) => `- id="${(s as any).id}" ${s.name}: ${s.durationMin} min, ₹${(s.pricePaise / 100).toFixed(0)}`)
    .join('\n')

  const hoursList = context.hours
    .filter((h) => !h.closed)
    .map((h) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return `${days[h.dayOfWeek]}: ${h.openTime} - ${h.closeTime}`
    })
    .join(', ')

  const slots = context.availableSlots?.slice(0, 6).join(', ') || 'Sunday 10 AM, 2 PM, 4:30 PM'

  // Channel awareness — caller passes the list of channels this business
  // has configured. We don't query the DB here; that's the caller's job
  // (they already have the data from the webhook flow).
  const channelsLine = context.availableChannels?.length
    ? `AVAILABLE CHANNELS (this business): ${context.availableChannels.join(', ')}`
    : 'AVAILABLE CHANNELS (this business): WhatsApp only.'

  const inboundChannelLine = context.inboundChannel
    ? `\nTHIS MESSAGE CAME VIA: ${context.inboundChannel.toUpperCase()}\n${channelGuidance(context.inboundChannel)}`
    : ''

  // Time / locale awareness — uses business timezone if provided, else IST
  // (the default for our primary market). Helps the AI say "we're closed
  // now" or "open in 30 min" naturally.
  const nowLine = (() => {
    try {
      const tz = (context as any).timezone || 'Asia/Kolkata'
      const now = new Date()
      const fmt = new Intl.DateTimeFormat('en-IN', {
        timeZone: tz,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      return `CURRENT TIME: ${fmt.format(now)} (${tz})`
    } catch {
      return null
    }
  })()

  // Open-now / closing-soon hint so the AI doesn't promise slots the
  // business isn't actually open for.
  const openNowHint = (() => {
    try {
      const tz = (context as any).timezone || 'Asia/Kolkata'
      const now = new Date()
      const localFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      })
      const parts = localFmt.formatToParts(now)
      const weekday = parts.find((p) => p.type === 'weekday')?.value as string
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
      const dow = dayMap[weekday] ?? -1
      const today = context.hours.find((h) => h.dayOfWeek === dow && !h.closed)
      if (!today) return 'OPEN-NOW: Closed today. Only suggest days when the business is open.'
      const [openH, openM] = today.openTime.split(':').map(Number)
      const [closeH, closeM] = today.closeTime.split(':').map(Number)
      const minutesNow = hour * 60 + minute
      const openMin = openH * 60 + (openM || 0)
      const closeMin = closeH * 60 + (closeM || 0)
      if (minutesNow < openMin) return `OPEN-NOW: Opens today at ${today.openTime}.`
      if (minutesNow >= closeMin) return 'OPEN-NOW: Closed for the day.'
      return `OPEN-NOW: Open until ${today.closeTime} today.`
    } catch {
      return null
    }
  })()

  return `${base}

BUSINESS INFO:
- Name: ${context.businessName}
- Type: ${context.vertical}
- City: ${context.city}
- Owner: ${context.ownerName}

SERVICES:
${servicesList}

HOURS: ${hoursList || '9 AM - 8 PM daily'}

AVAILABLE SLOTS (offer up to 3): ${slots}

${channelsLine}${inboundChannelLine}

${nowLine ? `${nowLine}\n` : ''}${openNowHint ? `${openNowHint}\n` : ''}
${context.knowledge ? `ADDITIONAL KNOWLEDGE:\n${context.knowledge}\n` : ''}
CUSTOMER:
- Name: ${context.customerName}
- Phone: ${context.customerPhone}
${context.customerContext ? `- Context: ${context.customerContext}` : ''}
${context.availableSlots?.length ? `- Today the business has these slots open: ${context.availableSlots.slice(0, 6).join(', ')}` : ''}

YOUR JOB: Help the customer book an appointment, answer questions about services/prices/hours, or escalate to the owner if needed. Be brief, warm, and move toward a booking. When the business is closed, say so and offer to schedule for the next open day — never invent slots.`
}

/**
 * Augment the AIContext with retrieved knowledge chunks before sending to LLM.
 * Synchronous lookup against the business's indexed KnowledgeSources.
 * Called by callers that have a businessId and a user message.
 */
export async function augmentContextWithKnowledge(context: AIContext): Promise<AIContext> {
  if (!context.businessId || !context.lastUserMessage?.trim()) return context
  try {
    const { retrieveKnowledge, formatKnowledgeContext } = await import('./knowledge-base')
    const chunks = await retrieveKnowledge(context.businessId, context.lastUserMessage, 4)
    if (chunks.length === 0) return context
    const kbContext = formatKnowledgeContext(chunks)
    return {
      ...context,
      knowledge: context.knowledge ? `${context.knowledge}\n\n${kbContext}` : kbContext,
    }
  } catch (err) {
    console.error('[ai] knowledge retrieval failed:', err)
    return context
  }
}

function mockReply(context: AIContext, userMessage: string): string {
  const lower = userMessage.toLowerCase()
  if (lower.includes('price') || lower.includes('cost') || lower.includes('kitna') || lower.includes('kya hai')) {
    const svc = context.services[0]
    if (svc) return `${context.customerName} जी, ${svc.name} की price ₹${(svc.pricePaise / 100).toFixed(0)} है। Appointment book karein? Available slots mein se kaunsa time suit karega? 🙏`
    return `${context.customerName} जी, hum aapko exact price bata denge. Konsi service mein interest hai?`
  }
  if (lower.includes('book') || lower.includes('appointment') || lower.includes('slot')) {
    return `Zaroor ${context.customerName} जी! 🙏 Ye slots available hain - 10 AM, 2 PM, 4:30 PM. Kaunsa time theek rahega?`
  }
  if (lower.includes('hour') || lower.includes('time') || lower.includes('khula') || lower.includes('open')) {
    return `${context.customerName} जी, hum ${context.city} mein ${context.hours.filter((h) => !h.closed).length} din available hain. Konsa din aapko suit karega?`
  }
  if (lower.includes('hi') || lower.includes('hello') || lower.includes('namaste')) {
    return `Namaste ${context.customerName} जी! 🙏 ${context.businessName} mein aapka swagat hai. Main aapki kaise madad kar sakta hoon - appointment booking, services, ya kuch aur?`
  }
  return `Namaste ${context.customerName} जी! 🙏 ${context.businessName} mein aapka swagat hai. Aap kya jaanna chahenge - services, prices, ya appointment?`
}
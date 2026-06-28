// AI provider abstraction — supports OpenAI or Google Gemini
// Use AI_PROVIDER env var to switch:
//   - "openai" (default if OPENAI_API_KEY set)
//   - "google" (if GOOGLE_API_KEY set)
//   - (unset) → Smart Hinglish fallback for dev/demo

import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export type AIProvider = 'openai' | 'google'

export interface AIContext {
  businessName: string
  vertical: string
  city: string
  ownerName: string
  language: string
  services: Array<{ name: string; durationMin: number; pricePaise: number }>
  hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string; closed: boolean }>
  knowledge?: string
  customerName: string
  customerPhone: string
  customerContext?: string
  availableSlots?: string[]
}

const SYSTEM_PROMPTS: Record<string, string> = {
  hinglish: `You are the AI assistant for a small Indian business on WhatsApp. You speak Hinglish naturally - mixing Hindi and English the way real Indian business owners and customers do. Use Devanagari for Hindi words, English for technical terms. Be warm, brief (under 60 words per message), and always move toward booking an appointment.

NEVER make up information. If you don't know something (price, availability, specific service), say "Main is baare mein owner se confirm karke batata hoon" and offer to have them call back.

Always be polite with "🙏" emoji when greeting or thanking. Use "ji" when addressing customers by name. Keep messages short - WhatsApp-friendly, not essays.`,

  hindi: `आप एक भारतीय छोटे व्यवसाय के WhatsApp AI सहायक हैं। आप हिंदी में बात करते हैं - देवनागरी में। संदेश छोटे रखें (60 शब्दों से कम), हमेशा अपॉइंटमेंट बुक करने की तरफ बढ़ें। कभी झूठी जानकारी न दें।`,

  english: `You are the AI assistant for a small business on WhatsApp, speaking English. Keep messages brief (under 60 words), warm, and always move toward booking an appointment. Never make up information. Use emojis sparingly.`,
}

// ============================================================
// MAIN ENTRY
// ============================================================

export async function generateAIReply(
  context: AIContext,
  conversationHistory: Array<{ role: 'customer' | 'assistant'; content: string }>,
  userMessage: string
): Promise<string> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase() as AIProvider | ''

  // Try configured providers in order: explicit choice, then auto-detect
  if (provider === 'google' || (!provider && process.env.GOOGLE_API_KEY)) {
    const result = await tryGemini(context, conversationHistory, userMessage)
    if (result) return result
  }

  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    const result = await tryOpenAI(context, conversationHistory, userMessage)
    if (result) return result
  }

  // Smart fallback (Hinglish pattern-matching)
  return mockReply(context, userMessage)
}

// ============================================================
// CUSTOM SYSTEM PROMPT (for automations, batch jobs)
// ============================================================

export async function generateWithCustomPrompt(
  systemPrompt: string,
  userMessage: string
): Promise<string | null> {
  const provider = (process.env.AI_PROVIDER || '').toLowerCase() as AIProvider | ''

  if (provider === 'google' || (!provider && process.env.GOOGLE_API_KEY)) {
    return await tryGeminiCustomPrompt(systemPrompt, userMessage)
  }
  if (provider === 'openai' || (!provider && process.env.OPENAI_API_KEY)) {
    return await tryOpenAICustomPrompt(systemPrompt, userMessage)
  }
  return null
}

async function tryOpenAICustomPrompt(systemPrompt: string, userMessage: string): Promise<string | null> {
  const openai = getOpenAI()
  if (!openai) return null
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })
    return completion.choices[0]?.message?.content?.trim() || null
  } catch (err) {
    console.error('[OpenAI custom prompt error]:', err)
    return null
  }
}

async function tryGeminiCustomPrompt(systemPrompt: string, userMessage: string): Promise<string | null> {
  const genai = getGemini()
  if (!genai) return null
  try {
    const model = genai.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-flash' })
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
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
  const openai = getOpenAI()
  if (!openai) return null

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
  const genai = getGemini()
  if (!genai) return null

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

function buildSystemPrompt(context: AIContext): string {
  const base = SYSTEM_PROMPTS[context.language] || SYSTEM_PROMPTS.hinglish

  const servicesList = context.services
    .map((s) => `- ${s.name}: ${s.durationMin} min, ₹${(s.pricePaise / 100).toFixed(0)}`)
    .join('\n')

  const hoursList = context.hours
    .filter((h) => !h.closed)
    .map((h) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return `${days[h.dayOfWeek]}: ${h.openTime} - ${h.closeTime}`
    })
    .join(', ')

  const slots = context.availableSlots?.slice(0, 6).join(', ') || 'Sunday 10 AM, 2 PM, 4:30 PM'

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

${context.knowledge ? `ADDITIONAL KNOWLEDGE:\n${context.knowledge}\n` : ''}
CUSTOMER:
- Name: ${context.customerName}
- Phone: ${context.customerPhone}
${context.customerContext ? `- Context: ${context.customerContext}` : ''}

YOUR JOB: Help the customer book an appointment, answer questions about services/prices/hours, or escalate to the owner if needed. Be brief, warm, and move toward a booking.`
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
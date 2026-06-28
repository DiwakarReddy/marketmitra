import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateWithCustomPrompt } from '@/lib/ai'
import { resolveChannel } from '@/lib/channel-resolver'
import { prisma } from '@/lib/db'
import { trackAIUsage } from '@/lib/automation/ai-usage'

// POST /api/ai/generate
// Body: { systemPrompt: string, userMessage: string }
// Uses business's own AI key if configured, otherwise platform key

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const { systemPrompt, userMessage } = body

  if (!systemPrompt || !userMessage) {
    return NextResponse.json({ error: 'systemPrompt and userMessage required' }, { status: 400 })
  }

  // Try to use business's own AI key (Google or OpenAI)
  const googleChannel = await resolveChannel(businessId, 'google_ai')
  const openaiChannel = await resolveChannel(businessId, 'openai')

  let result: string | null = null

  if (googleChannel?.credentials?.apiKey) {
    // Use business's Google AI key directly
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genai = new GoogleGenerativeAI(googleChannel.credentials.apiKey)
    try {
      const model = genai.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: systemPrompt,
      })
      const r = await model.generateContent(userMessage)
      result = r.response.text()
    } catch (err) {
      console.error('[ai/generate] Google AI failed:', err)
    }
  } else if (openaiChannel?.credentials?.apiKey) {
    // Use business's OpenAI key
    try {
      const OpenAI = (await import('openai')).default
      const openai = new OpenAI({ apiKey: openaiChannel.credentials.apiKey })
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 500,
      })
      result = completion.choices[0]?.message?.content || null
    } catch (err) {
      console.error('[ai/generate] OpenAI failed:', err)
    }
  } else {
    // Fall back to platform key
    result = await generateWithCustomPrompt(systemPrompt, userMessage)
    if (result) {
      // Mark business as using platform key
      await prisma.business.update({
        where: { id: businessId },
        data: { usingPlatformKey: true, platformKeySurchargeActive: true },
      })
    }
  }

  // Track usage ONCE per successful generation (not twice)
  if (result) {
    await trackAIUsage(businessId, 1)
  }

  // Final fallback: Hinglish template (no usage charge — this is a degraded response)
  if (!result) {
    result = `🎉 ${userMessage.split(' ').slice(0, 3).join(' ')} ke liye special offer!

Hum aapke liye best deals laaye hain. Abhi book karein aur 15% off paayein!

Reply YES to book or call us at +91-XXXX-XXXX.

— MarketMitra`
  }

  return NextResponse.json({ text: result })
}
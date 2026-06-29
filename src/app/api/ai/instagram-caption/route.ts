// /api/ai/instagram-caption — generate 3 Instagram captions in Hinglish
// Uses the business's knowledge base + their tone preference.
// AI key resolution matches the rest of the app: business's own key first,
// then platform key as fallback. Budget bypassed when business has own key.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateWithCustomPrompt } from '@/lib/ai'
import { guardedAICustom } from '@/lib/ai-guard'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'aiGenerate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const { topic, tone = 'casual' } = await req.json()
  if (!topic || typeof topic !== 'string') {
    return NextResponse.json({ error: 'topic required' }, { status: 400 })
  }

  // Make sure Instagram is connected — otherwise we'd burn AI budget for nothing
  const igConfig = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: 'instagram' } },
  })
  if (!igConfig?.isActive) {
    return NextResponse.json({
      error: 'Instagram not connected',
      details: 'Connect your Instagram Business account in Settings → Integrations before generating captions.',
    }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, vertical: true, city: true, ownerName: true, language: true },
  })
  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Pull knowledge base context (services, FAQs, recent posts) so captions
  // are on-brand and reference real offers/services.
  let knowledgeContext = ''
  try {
    const sources = await prisma.knowledgeSource.findMany({
      where: { businessId },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    })
    if (sources.length > 0) {
      knowledgeContext = `\n\nBUSINESS KNOWLEDGE BASE (use facts from here, don't invent):\n${sources
        .map((s) => `- [${s.type}] ${s.title}: ${s.content?.slice(0, 400)}`)
        .join('\n')}`
    }
  } catch {
    // ignore — knowledge base is optional
  }

  const toneGuidance: Record<string, string> = {
    casual: 'Conversational, friendly, like talking to a friend. Emojis are welcome.',
    professional: 'Polished and trustworthy. Suitable for a clinic or professional services business.',
    festive: 'Festive energy — Diwali, Holi, Eid, Christmas vibes. Use celebratory language and emojis.',
    educational: 'Teach the reader something useful. Use "Did you know?", "Here\'s why...", numbered tips.',
    before_after: 'Tell a transformation story. Focus on outcomes, confidence, and the customer experience.',
  }

  const systemPrompt = `You are an Instagram copywriter for a small Indian business. You write captions in Hinglish (Devanagari Hindi + English mix, the way real Indian customers speak).

Client:
- Business: ${business.name} (${business.vertical} in ${business.city || 'India'})
- Owner: ${business.ownerName}
${knowledgeContext}

Your job: Write 3 different Instagram captions for the topic below. Each caption must:
- Start with a hook line (curiosity, surprise, or question) — no generic greetings like "नमस्ते!" or "Hello friends!"
- Reference the business by name where natural
- Include a clear call-to-action (DM for booking, link in bio, comment below, save this post)
- Use 2-5 relevant emojis sprinkled naturally
- Be 80-180 words each
- Use 3-5 hashtags at the end (mix of Hindi + English)

Tone for these captions: ${toneGuidance[tone] || toneGuidance.casual}

OUTPUT FORMAT — return ONLY a valid JSON object, no markdown fences, no commentary:
{
  "captions": [
    "caption 1 full text here, with emojis and hashtags",
    "caption 2 full text here, with emojis and hashtags",
    "caption 3 full text here, with emojis and hashtags"
  ]
}`

  const userMessage = `Topic: ${topic}\nTone: ${tone}\n\nGenerate 3 distinct Instagram captions. Make each one feel like a different angle on the same topic — e.g. one educational, one promotional, one emotional. Return JSON only.`

  const result = await guardedAICustom(businessId, systemPrompt, userMessage, {
    cacheTtl: 600,
    source: 'custom',
  })

  if (!result.text) {
    return NextResponse.json({
      captions: [],
      error: 'AI service unavailable',
      details: 'Connect your own OpenAI or Google AI key in Settings → Integrations to generate captions, or contact support if this persists.',
    }, { status: 503 })
  }

  let parsed: { captions?: string[] }
  try {
    const cleaned = result.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
    parsed = JSON.parse(cleaned)
  } catch {
    // Fallback: split on newlines and take non-empty as captions
    const lines = result.text.split(/\n\n+/).map((l) => l.trim()).filter((l) => l.length > 30)
    parsed = { captions: lines.slice(0, 3) }
  }

  return NextResponse.json({
    captions: parsed.captions?.slice(0, 3) || [],
    provider: result.provider,
  })
}
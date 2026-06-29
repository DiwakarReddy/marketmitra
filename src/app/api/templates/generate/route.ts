// /api/templates/generate
//   POST { channel, category, purpose, audience?, tone?, language? }
//   AI-generates a template for the given channel + purpose.
//   Returns the full template (name, body, variables) — caller decides
//   whether to save it.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { generateTemplateWithAI } from '@/lib/templates'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  // AI calls are expensive — same-purpose repeat is rate-limited harder
  const rl = applyRateLimit(req, businessId, 'aiGenerate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const { channel, category, purpose, audience, tone, language } = await req.json()
  if (!channel || !purpose) {
    return NextResponse.json({ error: 'channel and purpose required' }, { status: 400 })
  }
  if (!['whatsapp', 'sms', 'email'].includes(channel)) {
    return NextResponse.json({ error: 'channel must be whatsapp, sms, or email' }, { status: 400 })
  }

  try {
    const generated = await generateTemplateWithAI({
      businessId,
      channel,
      category: category || 'marketing',
      purpose,
      audience,
      tone,
      language,
    })
    return NextResponse.json({ ok: true, template: generated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 })
  }
}

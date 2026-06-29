// /api/channels/instagram/settings — save automation toggles
// Stored in ChannelConfig.config (the non-secret JSON side)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'channelConnect')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const { autoDmEnabled, autoReplyEnabled } = await req.json()
  if (typeof autoDmEnabled !== 'boolean' || typeof autoReplyEnabled !== 'boolean') {
    return NextResponse.json({ error: 'autoDmEnabled and autoReplyEnabled (booleans) required' }, { status: 400 })
  }

  const existing = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: 'instagram' } },
  })
  if (!existing) {
    return NextResponse.json({
      error: 'Instagram not connected',
      details: 'Connect your Instagram account in Settings → Integrations first.',
    }, { status: 400 })
  }

  // Merge into existing config
  let config: Record<string, any> = {}
  try { config = existing.config ? JSON.parse(existing.config) : {} } catch {}
  config.autoDmEnabled = autoDmEnabled
  config.autoReplyEnabled = autoReplyEnabled

  await prisma.channelConfig.update({
    where: { id: existing.id },
    data: { config: JSON.stringify(config) },
  })

  return NextResponse.json({ ok: true, config })
}
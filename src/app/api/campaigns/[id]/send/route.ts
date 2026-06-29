// /api/campaigns/[id]/send — Start a campaign immediately.
// Uses the shared multi-channel worker from /api/campaigns/route.ts
// so behavior is identical whether started from the UI or the cron tick.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runCampaignSend, resolveAudience } from '@/app/api/campaigns/route'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'sendMessage')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, businessId },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status === 'running') {
    return NextResponse.json({ error: 'Campaign is already running' }, { status: 400 })
  }
  if (campaign.status === 'completed') {
    return NextResponse.json({ error: 'Campaign already completed' }, { status: 400 })
  }

  const audienceIds = await resolveAudience(businessId, campaign.audience || 'all')
  if (audienceIds.length === 0) {
    return NextResponse.json({ error: 'No customers match this audience. Import customers first.' }, { status: 400 })
  }

  // Determine templateId: the campaign's messageBody might be a freeform,
  // but if a `templateId` field is stored on the Campaign row we use it.
  // (Right now we keep the legacy messageBody path; future: add templateId
  // column. For now if messageBody is set and it starts with "tpl:" it's
  // a legacy marker; otherwise just send messageBody raw.)
  const templateId = (campaign as any).templateId || null

  // Run async — don't block the request
  runCampaignSend(campaign.id, businessId, templateId, audienceIds, campaign.messageBody || undefined)
    .catch((err) => console.error('[campaign send] failed:', err))

  return NextResponse.json({
    ok: true,
    queued: true,
    audienceCount: audienceIds.length,
  })
}
// /api/ctwa/campaigns/[id]
//   GET    : fetch single campaign
//   PATCH  : update status / settings (also calls Meta API for status changes)
//   DELETE : archive the campaign (also pauses in Meta)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/kms'
import { activateCTWACampaign, pauseCTWACampaign, fetchCTWAInsights } from '@/lib/ctwa'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const campaign = await prisma.cTWACampaign.findFirst({
    where: { id: params.id, businessId },
  })
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ campaign })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.cTWACampaign.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: any = {}
  let needsMetaSync = false
  let metaAction: 'activate' | 'pause' | null = null

  if (body.status && body.status !== existing.status) {
    if (['draft', 'active', 'paused', 'completed'].includes(body.status)) {
      updates.status = body.status
      needsMetaSync = true
      metaAction = body.status === 'active' ? 'activate' : body.status === 'paused' ? 'pause' : null
    }
  }
  if (typeof body.budgetDailyPaise === 'number' && body.budgetDailyPaise > 0) {
    updates.budgetDailyPaise = body.budgetDailyPaise
  }

  if (needsMetaSync && existing.metaAdId && metaAction) {
    const waChannel = await prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    })
    if (waChannel?.credentials) {
      try {
        const creds = await decryptJSON<Record<string, string>>(waChannel.credentials, businessId)
        if (metaAction === 'activate') {
          await activateCTWACampaign(existing.metaAdId, creds.accessToken)
        } else {
          await pauseCTWACampaign(existing.metaAdId, creds.accessToken)
        }
      } catch (err: any) {
        return NextResponse.json({ error: `Meta sync failed: ${err.message}` }, { status: 502 })
      }
    }
  }

  // Optional: refresh insights from Meta
  if (body.refreshInsights && existing.metaAdId) {
    const waChannel = await prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    })
    if (waChannel?.credentials) {
      try {
        const creds = await decryptJSON<Record<string, string>>(waChannel.credentials, businessId)
        const since = existing.lastSyncedAt || new Date(Date.now() - 30 * 86400000)
        const insights = await fetchCTWAInsights(existing.metaAdId, creds.accessToken, since)
        if (insights) {
          updates.impressions = parseInt(insights.impressions || '0', 10) || 0
          updates.clicks = parseInt(insights.clicks || '0', 10) || 0
          // spend is in account currency minor units (cents)
          const spendPaise = Math.round(parseFloat(insights.spend || '0') * 100)
          updates.spentPaise = spendPaise
          updates.lastSyncedAt = new Date()
        }
      } catch (err) {
        console.warn('[ctwa] insights refresh failed:', err)
      }
    }
  }

  await prisma.cTWACampaign.update({
    where: { id: existing.id },
    data: updates,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.cTWACampaign.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Pause in Meta (we don't delete the ad — Meta doesn't allow it after delivery)
  if (existing.metaAdId) {
    const waChannel = await prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    })
    if (waChannel?.credentials) {
      try {
        const creds = await decryptJSON<Record<string, string>>(waChannel.credentials, businessId)
        await pauseCTWACampaign(existing.metaAdId, creds.accessToken)
      } catch (err) {
        console.warn('[ctwa] pause on archive failed:', err)
      }
    }
  }

  await prisma.cTWACampaign.update({
    where: { id: existing.id },
    data: { status: 'completed' },
  })

  return NextResponse.json({ ok: true })
}
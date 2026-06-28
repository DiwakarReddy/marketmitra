import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CHANNEL_SCHEMAS, CHANNEL_ORDER } from '@/lib/channel-schemas'

// GET /api/admin/channels - Founder view: all tenant channel configs
export async function GET() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.ADMIN_EMAIL
  if (!session?.user || (adminEmail && session.user.email !== adminEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const configs = await prisma.channelConfig.findMany({
    include: {
      business: {
        select: {
          id: true,
          name: true,
          ownerEmail: true,
          ownerName: true,
          plan: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Group by business → channels
  const byBusiness: Record<string, {
    business: any
    channels: Array<{
      channel: string
      label: string
      provider: string | null
      isActive: boolean
      lastTestedAt: Date | null
      lastTestStatus: string | null
      hasCredentials: boolean
      connectedAt: Date | null
    }>
  }> = {}

  for (const cfg of configs) {
    const bid = cfg.businessId
    if (!byBusiness[bid]) {
      byBusiness[bid] = { business: cfg.business, channels: [] }
    }
    byBusiness[bid].channels.push({
      channel: cfg.channel,
      label: CHANNEL_SCHEMAS[cfg.channel]?.label || cfg.channel,
      provider: cfg.provider,
      isActive: cfg.isActive,
      lastTestedAt: cfg.lastTestedAt,
      lastTestStatus: cfg.lastTestStatus,
      hasCredentials: !!cfg.credentials,
      connectedAt: cfg.connectedAt,
    })
  }

  // Also fetch businesses with NO channels configured (potential customers)
  const allBusinesses = await prisma.business.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, ownerEmail: true, ownerName: true, plan: true, createdAt: true },
  })
  for (const b of allBusinesses) {
    if (!byBusiness[b.id]) {
      byBusiness[b.id] = { business: b, channels: [] }
    }
  }

  return NextResponse.json({
    businesses: Object.values(byBusiness),
    stats: {
      total: allBusinesses.length,
      withChannels: Object.values(byBusiness).filter((b) => b.channels.length > 0).length,
      whatsappConnected: configs.filter((c) => c.channel === 'whatsapp' && c.isActive).length,
      voiceConnected: configs.filter((c) => c.channel === 'voice' && c.isActive).length,
      instagramConnected: configs.filter((c) => c.channel === 'instagram' && c.isActive).length,
      googleAdsConnected: configs.filter((c) => c.channel === 'google_ads' && c.isActive).length,
      razorpayConnected: configs.filter((c) => c.channel === 'razorpay' && c.isActive).length,
      aiKeysConfigured: configs.filter((c) => (c.channel === 'openai' || c.channel === 'google_ai') && c.isActive).length,
    },
  })
}
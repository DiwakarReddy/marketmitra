// /api/campaigns/[id]/send — Start a draft campaign immediately (or scheduled → running)
// Performs the actual send via WhatsApp channel when applicable.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

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

  // Resolve recipient audience
  const audienceFilter = parseAudienceFilter(campaign.audience || 'all')

  const customers = await prisma.customer.findMany({
    where: { businessId, optedOut: false, ...audienceFilter.where },
    take: 500,
  })

  if (customers.length === 0) {
    return NextResponse.json({ error: 'No customers match this audience. Import customers first.' }, { status: 400 })
  }

  // Mark running
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'running', startedAt: new Date() },
  })

  // Best-effort async send (don't await in production; use queue. Here we await for simplicity.)
  const isWhatsApp = campaign.channels?.toLowerCase().includes('whatsapp')
  let sent = 0
  let failed = 0
  const errors: any[] = []

  if (isWhatsApp) {
    for (const customer of customers) {
      try {
        const result = await sendWhatsAppMessage(
          {
            to: customer.phone,
            type: campaign.messageBody ? 'text' : 'template',
            message: campaign.messageBody || '',
            templateName: campaign.name,
          },
          { businessId }
        )
        if (result.success) {
          sent++
        } else {
          failed++
          errors.push({ phone: customer.phone, error: result.error })
        }
      } catch (err: any) {
        failed++
        errors.push({ phone: customer.phone, error: err.message })
      }
    }
  } else {
    // Non-WhatsApp channels: just count as "queued" — no actual integration yet
    sent = customers.length
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      leads: customers.length,
      bookings: 0,
      endedAt: new Date(),
      status: failed === customers.length ? 'failed' : 'completed',
    },
  })

  return NextResponse.json({
    ok: true,
    campaign: updated,
    sent,
    failed,
    total: customers.length,
    errors: errors.slice(0, 10),
  })
}

function parseAudienceFilter(raw: string): { where: any } {
  const where: any = {}
  if (raw === 'inactive') {
    where.lastVisitAt = { lt: new Date(Date.now() - 90 * 86400000) }
  } else if (raw === 'vip') {
    where.totalVisits = { gte: 10 }
  } else if (raw === 'new') {
    where.totalVisits = 1
  } else if (raw?.startsWith('tag:')) {
    where.tags = { contains: raw.substring(4) }
  } else if (raw === 'birthday_this_month') {
    // Crude month match: birthday is a date; need raw SQL or post-filter
    // For MVP, leave open and post-filter
  }
  return { where }
}
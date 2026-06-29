import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { getReactivationMessage } from '@/lib/prompts'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const campaigns = await prisma.campaign.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const data = await req.json()
  const { name, type, channels, audience, messageBody, budgetPaise, scheduledFor } = data

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }
  if (!messageBody?.trim()) {
    return NextResponse.json({ error: 'Message body is required — write a message or generate with AI' }, { status: 400 })
  }
  if (name.trim().length > 120) {
    return NextResponse.json({ error: 'Campaign name too long (max 120 chars)' }, { status: 400 })
  }

  // Count audience
  let audienceCount = 0
  if (audience === 'all') {
    audienceCount = await prisma.customer.count({ where: { businessId, optedOut: false } })
  } else if (audience === 'vip') {
    audienceCount = await prisma.customer.count({ where: { businessId, optedOut: false, totalVisits: { gte: 10 } } })
  } else if (audience === 'inactive') {
    const cutoff = new Date(Date.now() - 90 * 86400000)
    audienceCount = await prisma.customer.count({ where: { businessId, optedOut: false, lastVisitAt: { lt: cutoff } } })
  } else if (audience === 'new') {
    audienceCount = await prisma.customer.count({ where: { businessId, optedOut: false, totalVisits: 1 } })
  } else if (audience?.startsWith('tag:')) {
    const tag = audience.slice(4)
    audienceCount = await prisma.customer.count({ where: { businessId, optedOut: false, tags: { contains: tag } } })
  } else if (audience === 'birthday_this_month') {
    const month = new Date().getMonth() + 1
    const all = await prisma.customer.findMany({ where: { businessId, optedOut: false, birthday: { not: null } } })
    audienceCount = all.filter((c) => c.birthday && new Date(c.birthday).getMonth() + 1 === month).length
  } else if (audience === 'anniversary_this_month') {
    const month = new Date().getMonth() + 1
    const all = await prisma.customer.findMany({ where: { businessId, optedOut: false, anniversary: { not: null } } })
    audienceCount = all.filter((c) => c.anniversary && new Date(c.anniversary).getMonth() + 1 === month).length
  }

  const status = scheduledFor ? 'scheduled' : 'draft'

  const campaign = await prisma.campaign.create({
    data: {
      businessId,
      name,
      type: type || 'broadcast',
      status,
      channels: channels || 'whatsapp',
      audience: audience || 'all',
      messageBody: messageBody || '',
      budgetPaise: budgetPaise || 0,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  })

  // If A/B test, create variant B as a separate campaign
  if (data.runABTest && data.variantB) {
    await prisma.campaign.create({
      data: {
        businessId,
        name: `${name} (Variant B)`,
        type: type || 'broadcast',
        status,
        channels: channels || 'whatsapp',
        audience: audience || 'all',
        messageBody: data.variantB,
        budgetPaise: budgetPaise || 0,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      },
    })
  }

  await prisma.activity.create({
    data: {
      businessId,
      type: 'campaign_created',
      actor: 'owner',
      title: `Campaign "${name}" created`,
      description: `Audience: ${audienceCount} customers • ${type} • ${channels}`,
    },
  })

  // If send-now, execute immediately
  if (!scheduledFor && channels?.includes('whatsapp') && audienceCount > 0) {
    try {
      // Get customers
      let customers: any[]
      if (audience === 'all') {
        customers = await prisma.customer.findMany({ where: { businessId, optedOut: false }, take: 500 })
      } else if (audience === 'vip') {
        customers = await prisma.customer.findMany({ where: { businessId, optedOut: false, totalVisits: { gte: 10 } } })
      } else if (audience === 'inactive') {
        const cutoff = new Date(Date.now() - 90 * 86400000)
        customers = await prisma.customer.findMany({ where: { businessId, optedOut: false, lastVisitAt: { lt: cutoff } } })
      } else {
        customers = []
      }

      // Mark campaign as running
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'running', startedAt: new Date() },
      })

      // Send messages (best-effort, in production use queue)
      let sent = 0
      for (const customer of customers.slice(0, 50)) { // limit to 50 in dev
        try {
          await sendWhatsAppMessage({
            to: customer.phone,
            message: messageBody,
          }, { businessId: businessId })
          sent++
        } catch (err) {
          console.error('Campaign send error:', err)
        }
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'completed', endedAt: new Date(), leads: sent },
      })
    } catch (err) {
      console.error('Campaign execution error:', err)
    }
  }

  return NextResponse.json({ ok: true, campaign, audienceCount })
}
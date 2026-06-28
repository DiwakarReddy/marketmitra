import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendEmail, dailySummaryEmail } from '@/lib/email'

// POST /api/billing/send-summary-email
// Sends daily summary email to the business owner
// Called by cron daily at 8 PM

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [leads, bookings, conversations, aiReplies, upcomingAppointments, revenue] = await Promise.all([
    prisma.lead.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.conversation.count({ where: { businessId, lastMessageAt: { gte: today, lt: tomorrow } } }),
    prisma.message.count({ where: { conversation: { businessId }, sender: 'ai', createdAt: { gte: today, lt: tomorrow } } }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startsAt: { gte: tomorrow, lt: new Date(tomorrow.getTime() + 86400000) },
        status: { in: ['booked', 'confirmed'] },
      },
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
    prisma.lead.aggregate({
      where: { businessId, status: 'paid', lastTouchAt: { gte: today, lt: tomorrow } },
      _sum: { valuePaise: true },
    }),
  ])

  const { subject, html } = dailySummaryEmail({
    ownerName: business.ownerName,
    businessName: business.name,
    date: today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    leads,
    bookings,
    conversations,
    aiReplies,
    revenue: (revenue._sum.valuePaise || 0) / 100,
    upcomingAppointments: upcomingAppointments.map((a) => ({
      time: new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
      customer: a.customer.name,
      service: a.service?.name || 'consultation',
    })),
  })

  const result = await sendEmail({
    to: business.ownerEmail,
    subject,
    html,
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'daily_summary_email',
      actor: 'ai',
      title: 'Daily summary email sent',
      metadata: JSON.stringify({ mocked: result.mocked, messageId: result.messageId }),
    },
  })

  return NextResponse.json({ ok: result.success, mocked: result.mocked, messageId: result.messageId })
}
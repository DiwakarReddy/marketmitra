import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/export?type=all&format=csv|json
// Exports all business data for download

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'csv'

  const [business, customers, appointments, messages, campaigns, leads] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.customer.findMany({ where: { businessId } }),
    prisma.appointment.findMany({ where: { businessId }, include: { customer: true, service: true } }),
    prisma.message.findMany({ where: { conversation: { businessId } }, include: { conversation: { include: { customer: true } } } }),
    prisma.campaign.findMany({ where: { businessId } }),
    prisma.lead.findMany({ where: { businessId }, include: { customer: true } }),
  ])

  if (format === 'json') {
    const data = { business, customers, appointments, messages, campaigns, leads, exportedAt: new Date().toISOString() }
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="marketmitra-export.json"`,
      },
    })
  }

  // CSV: customers + appointments (most-requested)
  const lines: string[] = []
  lines.push('--- CUSTOMERS ---')
  lines.push(['Name', 'Phone', 'Email', 'Language', 'Total Visits', 'Total Spent (₹)', 'Last Visit', 'Created', 'Opted Out'].join(','))
  for (const c of customers) {
    lines.push([
      `"${(c.name || '').replace(/"/g, '""')}"`,
      c.phone,
      c.email || '',
      c.language,
      c.totalVisits,
      (c.totalSpentPaise / 100).toFixed(2),
      c.lastVisitAt?.toISOString() || '',
      c.createdAt.toISOString(),
      c.optedOut ? 'yes' : 'no',
    ].join(','))
  }
  lines.push('')
  lines.push('--- APPOINTMENTS ---')
  lines.push(['Customer', 'Service', 'Starts At', 'Ends At', 'Status', 'Source', 'Notes'].join(','))
  for (const a of appointments) {
    lines.push([
      `"${(a.customer?.name || '').replace(/"/g, '""')}"`,
      `"${(a.service?.name || '').replace(/"/g, '""')}"`,
      a.startsAt.toISOString(),
      a.endsAt.toISOString(),
      a.status,
      a.source,
      `"${(a.notes || '').replace(/"/g, '""')}"`,
    ].join(','))
  }
  lines.push('')
  lines.push('--- CAMPAIGNS ---')
  lines.push(['Name', 'Type', 'Status', 'Channel', 'Leads', 'Bookings', 'Revenue (₹)', 'Created'].join(','))
  for (const c of campaigns) {
    lines.push([
      `"${(c.name || '').replace(/"/g, '""')}"`,
      c.type,
      c.status,
      c.channels,
      c.leads,
      c.bookings,
      (c.revenuePaise / 100).toFixed(2),
      c.createdAt.toISOString(),
    ].join(','))
  }

  const csv = lines.join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="marketmitra-export.csv"`,
    },
  })
}
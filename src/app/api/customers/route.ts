import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const customers = await prisma.customer.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return NextResponse.json({ customers })
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { businessId, customers } = data

    if (!businessId || !Array.isArray(customers)) {
      return NextResponse.json({ error: 'businessId and customers[] required' }, { status: 400 })
    }

    const results = []
    for (const c of customers) {
      const created = await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone: c.phone } },
        update: {
          name: c.name,
          email: c.email,
          lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : undefined,
          totalVisits: c.totalVisits,
          totalSpentPaise: c.totalSpentPaise,
          notes: c.notes,
        },
        create: {
          businessId,
          phone: c.phone,
          name: c.name || 'Customer',
          email: c.email,
          lastVisitAt: c.lastVisitAt ? new Date(c.lastVisitAt) : undefined,
          totalVisits: c.totalVisits || 0,
          totalSpentPaise: c.totalSpentPaise || 0,
          tags: c.tags ? JSON.stringify(c.tags) : JSON.stringify(['csv_upload']),
        },
      })
      results.push(created)
    }

    return NextResponse.json({
      ok: true,
      imported: results.length,
      customers: results,
    })
  } catch (err) {
    console.error('[Customers POST error]', err)
    return NextResponse.json({ error: 'Failed to import customers' }, { status: 500 })
  }
}
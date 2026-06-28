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

    // Support BOTH:
    //  - Single customer: { name, phone, email?, birthday?, ... }
    //  - Bulk import: { businessId, customers: [...] }
    // Single is determined by presence of `name` + `phone` without `customers[]`.

    const isBulk = Array.isArray(data.customers)
    if (!isBulk) {
      // Single customer path
      const session = await getServerSession(authOptions)
      if (!session?.user || !(session as any).businessId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const businessId = (session as any).businessId

      const name = (data.name || '').trim()
      const phone = (data.phone || '').trim().replace(/\D/g, '')
      if (!name || name.length < 2) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      }
      if (!phone || phone.length < 10) {
        return NextResponse.json({ error: 'Valid phone number is required (10+ digits)' }, { status: 400 })
      }

      const normalizedPhone = phone.length === 10 ? '91' + phone : phone

      const created = await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone: normalizedPhone } },
        update: {
          name,
          email: data.email || undefined,
          language: data.language || undefined,
          tags: data.tags || undefined,
          notes: data.notes || undefined,
          birthday: data.birthday ? new Date(data.birthday) : undefined,
          anniversary: data.anniversary ? new Date(data.anniversary) : undefined,
          source: data.source || 'manual',
        },
        create: {
          businessId,
          name,
          phone: normalizedPhone,
          email: data.email || null,
          language: data.language || 'hinglish',
          tags: data.tags || null,
          notes: data.notes || null,
          birthday: data.birthday ? new Date(data.birthday) : null,
          anniversary: data.anniversary ? new Date(data.anniversary) : null,
          source: data.source || 'manual',
        },
      })

      return NextResponse.json({ ok: true, customer: created, created: !data._exists })
    }

    // Bulk path
    const businessId = data.businessId
    const customers = data.customers
    if (!businessId || !Array.isArray(customers)) {
      return NextResponse.json({ error: 'businessId and customers[] required' }, { status: 400 })
    }

    const results = []
    for (const c of customers) {
      const phone = String(c.phone || '').replace(/\D/g, '')
      const normalizedPhone = phone.length === 10 ? '91' + phone : phone
      const created = await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone: normalizedPhone } },
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
          phone: normalizedPhone,
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
  } catch (err: any) {
    console.error('[Customers POST error]', err)
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to save customer' }, { status: 500 })
  }
}
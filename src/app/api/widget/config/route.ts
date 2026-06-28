import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/widget/config?businessId=xxx
// Returns public config for embedding on customer's website
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')

  if (!businessId) {
    return NextResponse.json({ error: 'businessId required' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      vertical: true,
      city: true,
      language: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, description: true, durationMin: true, pricePaise: true },
        orderBy: { pricePaise: 'asc' },
      },
      hours: { select: { dayOfWeek: true, openTime: true, closeTime: true, closed: true } },
    },
  })

  if (!business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  return NextResponse.json({
    business: {
      id: business.id,
      name: business.name,
      vertical: business.vertical,
      city: business.city,
      language: business.language,
    },
    services: business.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMin: s.durationMin,
      price: s.pricePaise / 100,
    })),
    hours: business.hours,
  })
}
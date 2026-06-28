import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, businessName, city, phone } = await req.json()

    if (!email || !password || !businessName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    // Create business + user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: businessName,
          vertical: 'dental', // default, user picks in onboarding
          ownerName: name,
          ownerEmail: email,
          ownerPhone: phone || '',
          city: city || '',
          language: 'hinglish',
          plan: 'trial',
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
        },
      })

      const user = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          businessId: business.id,
          role: 'owner',
        },
      })

      // Default services
      await tx.service.createMany({
        data: [
          { businessId: business.id, name: 'Consultation', durationMin: 30, pricePaise: 50000 },
          { businessId: business.id, name: 'Follow-up', durationMin: 15, pricePaise: 20000 },
        ],
      })

      // Default business hours
      await tx.businessHour.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          businessId: business.id,
          dayOfWeek: day,
          openTime: day === 0 ? '10:00' : '09:00',
          closeTime: day === 0 ? '14:00' : '20:00',
          closed: false,
        })),
      })

      return { business, user }
    })

    return NextResponse.json({ ok: true, businessId: result.business.id })
  } catch (err) {
    console.error('[Signup error]', err)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
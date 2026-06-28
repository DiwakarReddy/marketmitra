import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { chargeForBookings } from '@/lib/razorpay'

// POST /api/billing/charge - Charge customer for last month's bookings
// Called by cron at end of month

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Count bookings this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const bookingsCount = await prisma.appointment.count({
    where: {
      businessId,
      status: { in: ['booked', 'completed', 'visited'] },
      createdAt: { gte: startOfMonth },
    },
  })

  if (bookingsCount === 0) {
    return NextResponse.json({ ok: true, message: 'No bookings to charge', amount: 0 })
  }

  const amountPaise = bookingsCount * business.perBookingPaise

  const result = await chargeForBookings({
    businessId,
    bookingCount: bookingsCount,
    amountPaise,
    customerEmail: business.ownerEmail,
    customerPhone: business.ownerPhone,
  })

  // Create invoice record
  await prisma.invoice.create({
    data: {
      businessId,
      periodStart: startOfMonth,
      periodEnd: new Date(),
      bookings: bookingsCount,
      amountPaise,
      status: (result as any).mocked ? 'pending' : 'pending',
      razorpayId: (result as any).orderId || (result as any).id,
    },
  })

  return NextResponse.json({
    ok: true,
    bookings: bookingsCount,
    amount: amountPaise / 100,
    paymentLink: (result as any).shortUrl,
    mocked: (result as any).mocked,
  })
}
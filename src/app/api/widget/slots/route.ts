import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/widget/slots?businessId=xxx&serviceId=xxx&date=YYYY-MM-DD
// Returns available time slots for a given date

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const businessId = searchParams.get('businessId')
  const serviceId = searchParams.get('serviceId')
  const dateStr = searchParams.get('date')

  if (!businessId || !serviceId || !dateStr) {
    return NextResponse.json({ error: 'businessId, serviceId, date required' }, { status: 400 })
  }

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { durationMin: true, businessId: true, active: true },
  })
  if (!service || service.businessId !== businessId) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const dayOfWeek = date.getDay()
  const hours = await prisma.businessHour.findUnique({
    where: { businessId_dayOfWeek: { businessId, dayOfWeek } },
  })

  if (!hours || hours.closed) {
    return NextResponse.json({ slots: [], message: 'Closed on this day' })
  }

  // Generate slots based on business hours
  const [openHour, openMin] = hours.openTime.split(':').map(Number)
  const [closeHour, closeMin] = hours.closeTime.split(':').map(Number)
  const slotMinutes = service.durationMin
  // Add 15-min buffer between slots
  const intervalMinutes = slotMinutes + 15

  const dayStart = new Date(date)
  dayStart.setHours(openHour, openMin, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(closeHour, closeMin, 0, 0)

  const slots: string[] = []
  let cursor = new Date(dayStart)
  const now = new Date()

  while (cursor.getTime() + slotMinutes * 60000 <= dayEnd.getTime()) {
    // Skip past slots
    if (cursor > now) {
      slots.push(cursor.toISOString())
    }
    cursor = new Date(cursor.getTime() + intervalMinutes * 60000)
  }

  // Filter out already-booked slots
  const dayStartIso = dayStart.toISOString()
  const dayEndIso = dayEnd.toISOString()
  const bookedAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: ['booked', 'confirmed'] },
      startsAt: { gte: dayStartIso, lt: dayEndIso },
    },
    select: { startsAt: true, endsAt: true },
  })

  const availableSlots = slots.filter((slotIso) => {
    const slotStart = new Date(slotIso).getTime()
    const slotEnd = slotStart + slotMinutes * 60000
    return !bookedAppointments.some((apt) => {
      const aptStart = new Date(apt.startsAt).getTime()
      const aptEnd = new Date(apt.endsAt).getTime()
      return slotStart < aptEnd && slotEnd > aptStart
    })
  })

  return NextResponse.json({
    slots: availableSlots,
    total: slots.length,
    booked: bookedAppointments.length,
  })
}
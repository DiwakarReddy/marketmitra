// /api/whatsapp/booking/slots
//   POST { phone, serviceId, date }
//   Sends an interactive slot picker message to the customer's WhatsApp
//   with up to 10 buttons (3 buttons per message, so multiple messages if needed).
//
//   Also returns the slot list for the caller (e.g. AI orchestrator).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendInteractiveToNumber } from '@/lib/whatsapp'

interface SlotResponse {
  slots: { iso: string; label: string }[]
}

async function getSlots(businessId: string, serviceId: string, dateStr: string): Promise<SlotResponse> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { durationMin: true, businessId: true, name: true },
  })
  if (!service || service.businessId !== businessId) {
    return { slots: [] }
  }
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return { slots: [] }

  const dayOfWeek = date.getDay()
  const hours = await prisma.businessHour.findUnique({
    where: { businessId_dayOfWeek: { businessId, dayOfWeek } },
  })
  if (!hours || hours.closed) return { slots: [] }

  const [openHour, openMin] = hours.openTime.split(':').map(Number)
  const [closeHour, closeMin] = hours.closeTime.split(':').map(Number)
  const slotMinutes = service.durationMin
  const intervalMinutes = slotMinutes + 15

  const dayStart = new Date(date)
  dayStart.setHours(openHour, openMin, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(closeHour, closeMin, 0, 0)

  const candidates: string[] = []
  let cursor = new Date(dayStart)
  const now = new Date()
  while (cursor.getTime() + slotMinutes * 60000 <= dayEnd.getTime()) {
    if (cursor > now) candidates.push(cursor.toISOString())
    cursor = new Date(cursor.getTime() + intervalMinutes * 60000)
  }

  const booked = await prisma.appointment.findMany({
    where: {
      businessId,
      status: { in: ['booked', 'confirmed'] },
      startsAt: { gte: dayStart.toISOString(), lt: dayEnd.toISOString() },
    },
    select: { startsAt: true, endsAt: true },
  })

  const available = candidates.filter((iso) => {
    const slotStart = new Date(iso).getTime()
    const slotEnd = slotStart + slotMinutes * 60000
    return !booked.some((apt) => {
      const aptStart = new Date(apt.startsAt).getTime()
      const aptEnd = new Date(apt.endsAt).getTime()
      return slotStart < aptEnd && slotEnd > aptStart
    })
  })

  // Take first 10 slots (Meta list limit)
  const slots = available.slice(0, 10).map((iso) => {
    const d = new Date(iso)
    const label = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    return { iso, label }
  })
  return { slots }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const { phone, serviceId, date } = body
  if (!phone || !serviceId || !date) {
    return NextResponse.json({ error: 'phone, serviceId, date required' }, { status: 400 })
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { name: true, durationMin: true },
  })
  if (!service) return NextResponse.json({ error: 'Service not found' }, { status: 404 })

  const { slots } = await getSlots(businessId, serviceId, date)
  if (slots.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, slots, message: 'No slots available on that date' })
  }

  // Send interactive list message (up to 10 rows in a single list)
  const dateLabel = new Date(date).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

  const result = await sendInteractiveToNumber(
    phone,
    {
      type: 'list',
      headerText: `📅 ${dateLabel}`,
      bodyText: `${service.name} (${service.durationMin} min). Pick a slot:`,
      footerText: 'Tap to confirm · Powered by MarketMitra',
      sections: [
        {
          title: 'Available times',
          rows: slots.map((s) => ({
            id: `BOOK_${serviceId}_${s.iso}`,
            title: s.label,
            description: `${service.durationMin} min · ${dateLabel}`,
          })),
        },
      ],
    },
    { businessId }
  )

  if (!result.success) {
    return NextResponse.json({ error: result.error, sent: 0, slots }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    sent: 1,
    slots,
    messageId: result.messageId,
  })
}

// GET /api/whatsapp/booking/slots?phone=&serviceId=&date=
// Read-only — returns available slots for the AI orchestrator
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')
  const serviceId = searchParams.get('serviceId')
  const date = searchParams.get('date')
  if (!serviceId || !date) {
    return NextResponse.json({ error: 'serviceId, date required' }, { status: 400 })
  }
  const result = await getSlots(businessId, serviceId, date)
  return NextResponse.json(result)
}
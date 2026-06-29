// /api/whatsapp/booking/confirm
//   POST { phone, slotIso, serviceId, customerName? }
//   Books an appointment from an interactive button reply.
//   Called by the webhook handler when it detects a button with id starting with "BOOK_".
//
//   Idempotent: if the slot was already booked, returns 200 with ok:false.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const { phone, slotIso, serviceId, customerName } = body

  if (!phone || !slotIso || !serviceId) {
    return NextResponse.json({ error: 'phone, slotIso, serviceId required' }, { status: 400 })
  }

  const slotStart = new Date(slotIso)
  if (Number.isNaN(slotStart.getTime())) {
    return NextResponse.json({ error: 'Invalid slotIso' }, { status: 400 })
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { durationMin: true, name: true, businessId: true },
  })
  if (!service || service.businessId !== businessId) {
    return NextResponse.json({ error: 'Service not found' }, { status: 404 })
  }

  const slotEnd = new Date(slotStart.getTime() + service.durationMin * 60000)

  // Idempotency: check if the slot is still free
  const conflict = await prisma.appointment.findFirst({
    where: {
      businessId,
      serviceId,
      startsAt: slotStart,
      status: { in: ['booked', 'confirmed'] },
    },
  })
  if (conflict) {
    // Slot taken — send fallback message
    await sendWhatsAppMessage({
      to: phone,
      message: `Sorry, that slot was just taken. Please pick another time. 🙏`,
    }, { businessId })
    return NextResponse.json({ ok: false, reason: 'slot_taken' }, { status: 409 })
  }

  // Find or create customer
  let customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId, phone } },
  })
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        businessId, phone, name: customerName || 'WhatsApp customer',
        tags: JSON.stringify(['whatsapp_booking']),
      },
    })
  }

  const appt = await prisma.appointment.create({
    data: {
      businessId,
      customerId: customer.id,
      serviceId,
      startsAt: slotStart,
      endsAt: slotEnd,
      source: 'whatsapp_interactive',
      status: 'booked',
    },
  })

  // Send confirmation
  const dateLabel = slotStart.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short',
  })
  const timeLabel = slotStart.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  await sendWhatsAppMessage({
    to: phone,
    message: `✅ Booked! ${service.name} on ${dateLabel} at ${timeLabel}. Reply RESCHEDULE or CANCEL if you need to change.`,
  }, { businessId })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'appointment_booked',
      actor: 'customer',
      title: 'Booked via WhatsApp',
      description: `${service.name} at ${timeLabel} on ${dateLabel}`,
    },
  })

  // Trigger new_customer drip if newly created
  if (customer.createdAt && Date.now() - new Date(customer.createdAt).getTime() < 60_000) {
    try {
      const { triggerDripsForEvent } = await import('@/lib/drips')
      await triggerDripsForEvent(businessId, 'new_customer', customer.id)
    } catch (err) {
      console.warn('[booking] failed to trigger new_customer drip:', err)
    }
  }

  return NextResponse.json({ ok: true, appointmentId: appt.id })
}
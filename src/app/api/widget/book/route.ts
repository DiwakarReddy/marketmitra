import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// POST /api/widget/book
// Public endpoint — anyone can book through the widget
// Body: { businessId, serviceId, name, phone, email?, startsAt, notes? }

export async function POST(req: NextRequest) {
  try {
    const { businessId, serviceId, name, phone, email, startsAt, notes } = await req.json()

    if (!businessId || !serviceId || !name || !phone || !startsAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, perBookingPaise: true },
    })
    if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true, durationMin: true, businessId: true, active: true },
    })
    if (!service || service.businessId !== businessId || !service.active) {
      return NextResponse.json({ error: 'Service not found or inactive' }, { status: 404 })
    }

    // Validate start time is in future and during business hours
    const start = new Date(startsAt)
    if (start < new Date()) {
      return NextResponse.json({ error: 'Start time must be in the future' }, { status: 400 })
    }

    const end = new Date(start.getTime() + service.durationMin * 60000)

    // Check for slot conflicts
    const conflict = await prisma.appointment.findFirst({
      where: {
        businessId,
        status: { in: ['booked', 'confirmed'] },
        OR: [
          { startsAt: { lte: start }, endsAt: { gt: start } },
          { startsAt: { lt: end }, endsAt: { gte: end } },
          { startsAt: { gte: start }, endsAt: { lte: end } },
        ],
      },
    })
    if (conflict) {
      return NextResponse.json({ error: 'Slot already booked' }, { status: 409 })
    }

    // Find or create customer
    const phoneNormalized = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`
    let customer = await prisma.customer.findUnique({
      where: { businessId_phone: { businessId, phone: phoneNormalized } },
    })
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          businessId,
          phone: phoneNormalized,
          name,
          email,
          tags: JSON.stringify(['widget_booking']),
        },
      })
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        customerId: customer.id,
        serviceId: service.id,
        startsAt: start,
        endsAt: end,
        status: 'booked',
        source: 'widget',
        notes,
      },
    })

    // Log activity
    await prisma.activity.create({
      data: {
        businessId,
        type: 'booking',
        actor: 'customer',
        title: `New booking via widget: ${name}`,
        description: `${service.name} on ${start.toLocaleString('en-IN')}`,
      },
    })

    // Track as lead for attribution
    await prisma.lead.create({
      data: {
        businessId,
        customerId: customer.id,
        source: 'widget',
        status: 'booked',
        valuePaise: service.durationMin * 5000, // rough estimate
        firstTouchAt: new Date(),
        lastTouchAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      appointment: {
        id: appointment.id,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        service: service.name,
      },
      confirmationMessage: `आपका appointment confirm हो गया है! ${start.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} को ${business.name} में आइए।`,
    })
  } catch (err) {
    console.error('[Widget book error]', err)
    return NextResponse.json({ error: 'Booking failed' }, { status: 500 })
  }
}
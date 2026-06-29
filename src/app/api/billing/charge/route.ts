import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { chargeForBookings } from '@/lib/razorpay'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendEmail } from '@/lib/email'

// POST /api/billing/charge - Charge customer for last month's bookings
// Called by cron at end of month (or manually by owner to retry)

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  if (business.plan === 'suspended' || business.plan === 'starter_paused') {
    return NextResponse.json({ error: `Account is ${business.plan} — cannot charge` }, { status: 400 })
  }

  // Count bookings this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const bookingsCount = await prisma.appointment.count({
    where: {
      businessId,
      status: { in: ['completed', 'visited'] }, // only bill for completed visits
      createdAt: { gte: startOfMonth },
    },
  })

  if (bookingsCount === 0) {
    return NextResponse.json({ ok: true, message: 'No completed bookings to charge', amount: 0 })
  }

  const amountPaise = bookingsCount * business.perBookingPaise
  const result = await chargeForBookings({
    businessId,
    bookingCount: bookingsCount,
    amountPaise,
    customerEmail: business.ownerEmail,
    customerPhone: business.ownerPhone,
  })

  // Mock mode: just log and return; otherwise create invoice + send link
  if ((result as any).mocked) {
    await prisma.activity.create({
      data: {
        businessId, type: 'billing_mock', actor: 'system',
        title: `[MOCK] Would charge ₹${(amountPaise / 100).toFixed(0)} for ${bookingsCount} bookings`,
        description: 'Razorpay creds missing — set RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to enable real billing',
      },
    })
    return NextResponse.json({
      ok: true, mocked: true,
      bookings: bookingsCount, amount: amountPaise / 100,
    })
  }

  // Real billing: create invoice + deliver payment link to customer
  const invoice = await prisma.invoice.create({
    data: {
      businessId,
      periodStart: startOfMonth,
      periodEnd: new Date(),
      bookings: bookingsCount,
      amountPaise,
      status: 'pending',
      razorpayOrderId: (result as any).orderId || null,
      razorpayPaymentLinkId: (result as any).paymentLinkId || null,
      paymentLinkUrl: (result as any).shortUrl || null,
    },
  })

  const paymentLink = (result as any).shortUrl
  const rupees = (amountPaise / 100).toFixed(0)
  const monthLabel = startOfMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Send payment link via WhatsApp (primary channel — most customers)
  if (business.ownerPhone) {
    sendWhatsAppMessage({
      to: business.ownerPhone,
      message: `${business.ownerName?.split(' ')[0] || 'Hi'} जी, ${monthLabel} का MarketMitra invoice ₹${rupees} (${bookingsCount} bookings × ₹${(business.perBookingPaise / 100).toFixed(0)})। Pay here: ${paymentLink}\n\n— MarketMitra`,
    }, { businessId }).catch((err) => console.error('[billing] failed to send WhatsApp link:', err))
  }

  // Also email the link as a backup
  if (business.ownerEmail && paymentLink) {
    sendEmail({
      to: business.ownerEmail,
      subject: `MarketMitra invoice for ${monthLabel} — ₹${rupees}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0f172a;">MarketMitra — ${monthLabel} invoice</h2>
          <p>Hi ${business.ownerName?.split(' ')[0] || 'there'},</p>
          <p>Your invoice for ${monthLabel}: <strong>₹${rupees}</strong> for ${bookingsCount} completed bookings.</p>
          <p>Per-booking rate: ₹${(business.perBookingPaise / 100).toFixed(0)}</p>
          <a href="${paymentLink}" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 16px 0;">Pay invoice →</a>
          <p style="color: #64748b; font-size: 12px;">Invoice ID: ${invoice.id}</p>
        </div>
      `,
    }).catch((err) => console.error('[billing] failed to send invoice email:', err))
  }

  return NextResponse.json({
    ok: true,
    bookings: bookingsCount,
    amount: amountPaise / 100,
    paymentLink,
    invoiceId: invoice.id,
  })
}
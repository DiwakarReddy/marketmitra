import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/razorpay'

// Razorpay webhook for payment events

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''

  if (secret && !verifyWebhookSignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const event = JSON.parse(body)

  switch (event.event) {
    case 'payment.captured':
    case 'payment_link.paid': {
      const payment = event.payload.payment?.entity || event.payload.payment_link?.entity
      const invoice = await prisma.invoice.findFirst({
        where: { razorpayId: payment.notes?.invoiceId || payment.receipt },
      })
      if (invoice) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'paid', paidAt: new Date(), razorpayInvoiceId: payment.id },
        })
        await prisma.activity.create({
          data: {
            businessId: invoice.businessId,
            type: 'payment_received',
            actor: 'system',
            title: `Payment received: ₹${(invoice.amountPaise / 100).toFixed(0)}`,
            description: `${invoice.bookings} bookings`,
          },
        })
      }
      break
    }
    case 'payment.failed': {
      const payment = event.payload.payment?.entity
      await prisma.invoice.updateMany({
        where: { razorpayId: payment.receipt },
        data: { status: 'failed' },
      })
      break
    }
  }

  return NextResponse.json({ ok: true })
}
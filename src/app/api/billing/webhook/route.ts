// /api/billing/webhook
// Razorpay webhook for payment + subscription events.
//
// We handle:
//   - payment.captured / payment_link.paid → mark invoice paid
//   - payment.failed → mark invoice failed
//   - subscription.activated / created → store new subscription ID
//   - subscription.cancelled / completed → end-of-cycle bookkeeping
//   - refund.created → flag the original invoice for review
//
// Signature verification is mandatory in production.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/razorpay'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET

  if (!secret) {
    console.error('[billing/webhook] RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
  }

  if (!verifyWebhookSignature(body, signature, secret)) {
    console.warn('[billing/webhook] Invalid signature from Razorpay')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(body)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Razorpay events are namespaced: 'payment.captured', 'subscription.activated', etc.
  const eventType: string = event.event
  const entity = event.payload?.[eventType.split('.')[0]]?.entity

  if (!entity) {
    // Unhandled event shape — acknowledge so Razorpay doesn't retry
    return NextResponse.json({ ok: true, ignored: eventType })
  }

  try {
    switch (eventType) {
      case 'payment.captured':
      case 'payment_link.paid': {
        const payment = entity
        // Match by receipt (we set receipt = b_<businessId>_<ts> when creating the order)
        const receipt: string = payment.receipt || ''
        const businessIdMatch = receipt.match(/^b_([a-z0-9]+)_/)
        const businessId = businessIdMatch?.[1] || payment.notes?.businessId

        const invoice = await prisma.invoice.findFirst({
          where: {
            OR: [
              { razorpayOrderId: payment.order_id || payment.id },
              { razorpayPaymentLinkId: payment.id },
              { razorpayId: payment.notes?.invoiceId || receipt },
              ...(businessId
                ? [{ businessId, status: 'pending' as const, periodStart: { gte: new Date(Date.now() - 35 * 86400000) } }]
                : []),
            ],
          },
          orderBy: { createdAt: 'desc' },
        })

        if (invoice) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'paid',
              paidAt: new Date(),
              razorpayPaymentId: payment.id,
              razorpayPaymentLinkId: payment['payment_link'] || payment.id,
            },
          })
          await prisma.activity.create({
            data: {
              businessId: invoice.businessId,
              type: 'payment_received',
              actor: 'system',
              title: `Payment received: ₹${(invoice.amountPaise / 100).toFixed(0)}`,
              description: `${invoice.bookings} bookings — payment ${payment.id}`,
            },
          })

          // Auto-resume if account was paused
          const business = await prisma.business.findUnique({ where: { id: invoice.businessId } })
          if (business && (business.plan === 'starter_paused' || business.plan === 'suspended')) {
            await prisma.business.update({
              where: { id: invoice.businessId },
              data: { plan: 'starter' },
            })
            await prisma.activity.create({
              data: {
                businessId: invoice.businessId,
                type: 'service_resumed',
                actor: 'system',
                title: 'Service resumed after payment',
              },
            })
          }
        } else {
          console.warn(`[billing/webhook] No invoice matched payment ${payment.id} (receipt=${receipt})`)
        }
        break
      }

      case 'payment.failed': {
        const payment = entity
        const receipt: string = payment.receipt || ''
        const businessIdMatch = receipt.match(/^b_([a-z0-9]+)_/)
        const businessId = businessIdMatch?.[1] || payment.notes?.businessId
        if (businessId) {
          await prisma.activity.create({
            data: {
              businessId, type: 'payment_failed', actor: 'system',
              title: `Payment failed: ₹${((payment.amount || 0) / 100).toFixed(0)}`,
              description: payment.error_description || payment.error_reason || 'Card declined',
            },
          })
        }
        break
      }

      case 'subscription.activated':
      case 'subscription.created': {
        const sub = entity
        const businessId = sub.notes?.businessId || sub.notes?.customerId
        if (businessId) {
          await prisma.business.updateMany({
            where: { id: businessId },
            data: {
              razorpaySubscriptionId: sub.id,
              razorpayCustomerId: sub.customer_id || undefined,
            },
          })
        }
        break
      }

      case 'subscription.cancelled': {
        const sub = entity
        if (sub.id) {
          await prisma.business.updateMany({
            where: { razorpaySubscriptionId: sub.id },
            data: { razorpaySubscriptionId: null },
          })
        }
        break
      }

      case 'refund.created': {
        const refund = entity
        const paymentId = refund.payment_id
        if (paymentId) {
          const invoice = await prisma.invoice.findFirst({
            where: { razorpayPaymentId: paymentId },
          })
          if (invoice) {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: { status: 'refunded' },
            })
            await prisma.activity.create({
              data: {
                businessId: invoice.businessId,
                type: 'refund_issued',
                actor: 'system',
                title: `Refund issued: ₹${((refund.amount || 0) / 100).toFixed(0)}`,
              },
            })
          }
        }
        break
      }

      default:
        // Unhandled event type — log and acknowledge
        console.log(`[billing/webhook] unhandled event: ${eventType}`)
    }

    return NextResponse.json({ ok: true, event: eventType })
  } catch (err: any) {
    console.error('[billing/webhook] handler error:', err)
    // Return 500 so Razorpay retries; we've already done partial work
    return NextResponse.json({ error: err.message || 'handler error' }, { status: 500 })
  }
}

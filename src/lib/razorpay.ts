import Razorpay from 'razorpay'
import crypto from 'crypto'

const keyId = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

export function getRazorpay(): Razorpay | null {
  if (!keyId || !keySecret || keyId === '') return null
  return new Razorpay({ key_id: keyId, key_secret: keySecret })
}

export async function createOrder(params: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  const rz = getRazorpay()
  if (!rz) {
    // Mock mode
    return {
      id: `mock_order_${Date.now()}`,
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      status: 'created',
      mocked: true,
    }
  }

  return rz.orders.create({
    amount: params.amountPaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes,
  })
}

export async function createSubscription(params: {
  customerId: string
  planId: string
  totalCount?: number
}) {
  const rz = getRazorpay()
  if (!rz) return { id: `mock_sub_${Date.now()}`, status: 'created', mocked: true }

  return rz.subscriptions.create({
    plan_id: params.planId,
    customer_notify: 1,
    total_count: params.totalCount || 12,
    notes: { customerId: params.customerId },
  })
}

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// Per-booking pricing model:
// At end of month, count confirmed appointments, multiply by ₹200, send invoice via Razorpay
export async function chargeForBookings(params: { businessId: string; bookingCount: number; amountPaise: number; customerEmail: string; customerPhone: string }) {
  const rz = getRazorpay()
  if (!rz) {
    console.log('[Razorpay MOCK] Would charge ₹' + params.amountPaise / 100 + ' for ' + params.bookingCount + ' bookings')
    return { id: `mock_pay_${Date.now()}`, status: 'captured', mocked: true }
  }

  // Create a one-time order + use payment link
  const order = await rz.orders.create({
    amount: params.amountPaise,
    currency: 'INR',
    receipt: `b_${params.businessId}_${Date.now()}`,
    notes: { businessId: params.businessId, bookingCount: String(params.bookingCount) },
  })

  // In production, generate a payment link to send to customer
  const link = await rz.paymentLink.create({
    amount: params.amountPaise,
    currency: 'INR',
    description: `MarketMitra - ${params.bookingCount} bookings this month`,
    customer: { email: params.customerEmail, contact: params.customerPhone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    notes: { businessId: params.businessId },
    callback_url: `${process.env.APP_URL}/billing?status=success`,
    callback_method: 'get',
  })

  return { orderId: order.id, paymentLinkId: link.id, shortUrl: link.short_url, status: 'pending' }
}
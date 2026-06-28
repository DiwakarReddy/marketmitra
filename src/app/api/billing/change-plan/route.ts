import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlan } from '@/lib/plans'
import { createSubscription } from '@/lib/razorpay'

// POST /api/billing/change-plan
// Self-serve plan upgrade/downgrade
// Body: { planId: 'starter' | 'growth' | 'scale' }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const { planId } = await req.json()

  const plan = getPlan(planId)
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Don't downgrade if current usage exceeds new plan limits
  if (plan.maxCustomers !== null) {
    const customerCount = await prisma.customer.count({ where: { businessId, optedOut: false } })
    if (customerCount > plan.maxCustomers) {
      return NextResponse.json({
        error: `Cannot downgrade: you have ${customerCount} customers but ${plan.name} allows ${plan.maxCustomers}. Delete some customers first.`,
      }, { status: 400 })
    }
  }

  // Cancel old subscription if any
  if (business.razorpaySubscriptionId) {
    // In production: call razorpay.subscriptions.cancel(business.razorpaySubscriptionId)
    console.log('[billing] Cancelling old subscription:', business.razorpaySubscriptionId)
  }

  // Create new subscription (or update billing model)
  const updates: any = {
    plan: plan.id,
    perBookingPaise: plan.perBookingPaise,
  }

  if (plan.monthlyPaise) {
    // Monthly plan via Razorpay
    const sub = await createSubscription({
      customerId: business.razorpayCustomerId || business.id,
      planId: `plan_${plan.id}_monthly_${plan.monthlyPaise}`,
      totalCount: 12,
    })
    updates.razorpaySubscriptionId = (sub as any).id
    updates.monthlyPricePaise = plan.monthlyPaise
  } else {
    // Per-booking only — no fixed subscription
    updates.razorpaySubscriptionId = null
    updates.monthlyPricePaise = 0
  }

  await prisma.business.update({
    where: { id: businessId },
    data: updates,
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'plan_changed',
      actor: 'owner',
      title: `Plan changed to ${plan.name}`,
      description: `Now ₹${(plan.perBookingPaise / 100).toFixed(0)} per booking${plan.monthlyPaise ? ` + ₹${(plan.monthlyPaise / 100).toFixed(0)}/month` : ''}`,
    },
  })

  return NextResponse.json({
    ok: true,
    plan: {
      id: plan.id,
      name: plan.name,
      perBookingPaise: plan.perBookingPaise,
      monthlyPaise: plan.monthlyPaise,
    },
  })
}
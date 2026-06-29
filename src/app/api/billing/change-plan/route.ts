import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getPlan } from '@/lib/plans'
import { createSubscription, getRazorpay } from '@/lib/razorpay'

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

  // Cancel old Razorpay subscription. The Razorpay SDK's TS types
  // don't expose cancel_at_cycle_end cleanly across versions, so we
  // call the underlying API with the raw option and fall back to
  // immediate cancel if that fails.
  if (business.razorpaySubscriptionId) {
    const rz = getRazorpay()
    if (rz) {
      try {
        // Try scheduled cancellation via PATCH (Razorpay REST API)
        try {
          const RazorpayAny = rz as any
          await RazorpayAny.subscriptions.patch(business.razorpaySubscriptionId, {
            cancel_at_cycle_end: true,
          })
          console.log(`[billing] scheduled cancellation of sub ${business.razorpaySubscriptionId} at end of cycle`)
        } catch (updateErr: any) {
          // Fallback: immediate cancel
          await rz.subscriptions.cancel(business.razorpaySubscriptionId)
          console.log(`[billing] immediately cancelled sub ${business.razorpaySubscriptionId}`)
        }
      } catch (err: any) {
        console.error(`[billing] failed to cancel subscription ${business.razorpaySubscriptionId}:`, err.message)
      }
    }
  }

  // Apply plan changes
  const updates: any = {
    plan: plan.id,
    perBookingPaise: plan.perBookingPaise,
    monthlyPricePaise: plan.monthlyPaise ?? 0,
  }

  if (plan.monthlyPaise) {
    // Monthly plan: create new Razorpay subscription
    const sub = await createSubscription({
      customerId: business.razorpayCustomerId || business.id,
      planId: `plan_${plan.id}_monthly_${plan.monthlyPaise}`,
      totalCount: 12,
    })
    if (!(sub as any).mocked) {
      updates.razorpaySubscriptionId = (sub as any).id
    }
  } else {
    // Per-booking only — no fixed subscription
    updates.razorpaySubscriptionId = null
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

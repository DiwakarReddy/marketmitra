// AI usage tracking
// - Counts AI messages per business
// - Resets monthly
// - Bills for overage + platform key surcharge

import { prisma } from '@/lib/db'
import { getPlanFeatures } from '@/lib/plan-features'

// Increment AI usage counter
// Called by AI code paths (inbox, automation, campaigns)
// Uses atomic increment + conditional reset to avoid race conditions
// when multiple AI calls land at month boundary.
export async function trackAIUsage(businessId: string, count: number = 1) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, plan: true, aiMessagesThisMonth: true, aiMessagesResetAt: true, usingPlatformKey: true },
  })
  if (!business) return

  const now = new Date()
  const needsReset = !business.aiMessagesResetAt || business.aiMessagesResetAt < now

  if (needsReset) {
    // Atomic conditional update: only reset if reset date is still in the past
    // (prevents losing counts if two requests race here)
    const updated = await prisma.business.updateMany({
      where: {
        id: businessId,
        OR: [
          { aiMessagesResetAt: null },
          { aiMessagesResetAt: { lt: now } },
        ],
      },
      data: { aiMessagesThisMonth: count, aiMessagesResetAt: getNextResetDate(now) },
    })
    if (updated.count > 0) return // Reset succeeded, counter is now `count`
    // Lost the race — fall through to increment
  }

  // Normal increment (atomic - no read-then-write race)
  await prisma.business.update({
    where: { id: businessId },
    data: { aiMessagesThisMonth: { increment: count } },
  })
}

function getNextResetDate(now: Date): Date {
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  next.setDate(1)
  next.setHours(0, 0, 0, 0)
  return next
}

// Get current usage for a business
export async function getAIUsage(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      plan: true,
      aiMessagesThisMonth: true,
      aiMessagesResetAt: true,
      usingPlatformKey: true,
      platformKeySurchargeActive: true,
    },
  })
  if (!business) return null

  const planFeatures = getPlanFeatures(business.plan)
  const included = planFeatures.aiMessagesIncluded
  const used = business.aiMessagesThisMonth
  const overage = Math.max(0, used - included)
  const overagePaise = overage * planFeatures.aiMessageOveragePaise

  return {
    plan: business.plan,
    planLabel: planFeatures.label,
    included,
    used,
    remaining: Math.max(0, included - used),
    overage,
    overagePaise,
    overageRupees: overagePaise / 100,
    resetAt: business.aiMessagesResetAt,
    usingPlatformKey: business.usingPlatformKey,
    platformKeySurchargePaise: business.platformKeySurchargeActive ? planFeatures.platformKeySurchargePaise : 0,
    daysUntilReset: business.aiMessagesResetAt
      ? Math.ceil((new Date(business.aiMessagesResetAt).getTime() - Date.now()) / 86400000)
      : 0,
  }
}

// Apply platform key surcharge to next invoice
// Run by daily cron — adds charge if business is using platform key but hasn't paid
export async function applyPlatformKeySurcharge() {
  const businesses = await prisma.business.findMany({
    where: {
      usingPlatformKey: true,
      platformKeySurchargeActive: false,
      plan: { not: 'suspended' },
    },
  })

  for (const business of businesses) {
    const planFeatures = getPlanFeatures(business.plan)
    const surcharge = planFeatures.platformKeySurchargePaise
    if (surcharge === 0) continue

    // Check if there's an existing pending invoice for this business
    const existing = await prisma.invoice.findFirst({
      where: { businessId: business.id, status: 'pending' },
    })

    await prisma.invoice.create({
      data: {
        businessId: business.id,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86400000),
        bookings: 0,
        amountPaise: surcharge,
        status: 'pending',
      },
    })

    await prisma.business.update({
      where: { id: business.id },
      data: { platformKeySurchargeActive: true },
    })

    await prisma.activity.create({
      data: {
        businessId: business.id,
        type: 'platform_key_charge',
        actor: 'system',
        title: 'Platform AI key surcharge added',
        description: `₹${surcharge / 100}/month for using MarketMitra's AI key`,
      },
    })
  }

  return { charged: businesses.length }
}
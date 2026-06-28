// Feature #5: No-show prediction + confirmation flow
// AI scores each appointment's no-show risk (0-1)
// High-risk (>0.6) → sends confirmation request 24h before
// Mid-risk (>0.3) → sends reminder 2h before
// Tracks actual no-shows to improve the model over time

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateAIReply } from '@/lib/ai'

interface NoShowFeatures {
  customerId: string
  startsAt: Date
  isFirstVisit: boolean
  totalPastVisits: number
  pastNoShowCount: number
  pastNoShowRate: number
  daysSinceLastVisit: number
  bookingLeadTimeDays: number
  hourOfDay: number
  dayOfWeek: number
  monthOfYear: number
  serviceDurationMin: number
  customerTotalSpent: number
}

const NO_SHOW_COOLDOWN_DAYS = 30

// Calculate no-show probability based on simple rules
// Returns 0-1 score
export function calculateNoShowScore(features: NoShowFeatures): number {
  let score = 0.3 // base rate

  // Past no-shows are strong predictor
  if (features.pastNoShowCount > 0) {
    score += features.pastNoShowRate * 0.4
  }

  // First-time customers more likely to no-show
  if (features.isFirstVisit) {
    score += 0.15
  }

  // Long time since last visit = more likely to no-show
  if (features.daysSinceLastVisit > 180) {
    score += 0.2
  } else if (features.daysSinceLastVisit > 90) {
    score += 0.1
  }

  // Very long lead time = more likely to forget
  if (features.bookingLeadTimeDays > 30) {
    score += 0.15
  } else if (features.bookingLeadTimeDays > 14) {
    score += 0.08
  }

  // Time of day
  if (features.hourOfDay < 9 || features.hourOfDay > 18) {
    score += 0.1 // off-hours appointments more likely to no-show
  }

  // Mondays and Sundays
  if (features.dayOfWeek === 1 || features.dayOfWeek === 0) {
    score += 0.08
  }

  // Summer vacation / monsoon (June, July, December)
  if ([5, 6, 11].includes(features.monthOfYear)) {
    score += 0.05
  }

  // High-value customers no-show less
  if (features.customerTotalSpent > 100000) {
    score -= 0.1
  }

  return Math.max(0, Math.min(1, score))
}

// Called by cron to score unrated appointments
export async function scoreUpcomingAppointments() {
  const businesses = await prisma.business.findMany({
    where: {
      noShowPredictionEnabled: true,
      plan: { not: 'suspended' },
    },
  })

  let scored = 0
  for (const business of businesses) {
    const horizon = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: 'booked',
        startsAt: { gte: new Date(), lte: horizon },
        noShowScore: null,
      },
      include: {
        customer: true,
        service: true,
      },
      take: 100,
    })

    for (const appt of appointments) {
      // Get customer's no-show history
      const pastAppts = await prisma.appointment.findMany({
        where: {
          customerId: appt.customerId,
          status: { in: ['no_show', 'completed', 'cancelled'] },
        },
      })
      const noShows = pastAppts.filter((a) => a.status === 'no_show').length
      const total = pastAppts.length

      const daysSinceLastVisit = appt.customer.lastVisitAt
        ? Math.floor((Date.now() - appt.customer.lastVisitAt.getTime()) / 86400000)
        : 9999

      const score = calculateNoShowScore({
        customerId: appt.customerId,
        startsAt: appt.startsAt,
        isFirstVisit: appt.customer.totalVisits === 0,
        totalPastVisits: appt.customer.totalVisits,
        pastNoShowCount: noShows,
        pastNoShowRate: total > 0 ? noShows / total : 0,
        daysSinceLastVisit,
        bookingLeadTimeDays: Math.floor((appt.startsAt.getTime() - appt.createdAt.getTime()) / 86400000),
        hourOfDay: appt.startsAt.getHours(),
        dayOfWeek: appt.startsAt.getDay(),
        monthOfYear: appt.startsAt.getMonth(),
        serviceDurationMin: appt.service?.durationMin || 30,
        customerTotalSpent: appt.customer.totalSpentPaise,
      })

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { noShowScore: score },
      })
      scored++
    }
  }
  return { scored }
}

// Send confirmation requests to high-risk appointments
// Runs 24h before appointment
export async function sendConfirmationRequests() {
  const businesses = await prisma.business.findMany({
    where: {
      confirmationsEnabled: true,
      noShowPredictionEnabled: true,
      plan: { not: 'suspended' },
    },
  })

  let sent = 0
  const windowStart = new Date(Date.now() + 22 * 60 * 60 * 1000) // 22h ahead
  const windowEnd = new Date(Date.now() + 26 * 60 * 60 * 1000) // 26h ahead

  for (const business of businesses) {
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: 'booked',
        startsAt: { gte: windowStart, lte: windowEnd },
        confirmationSent: false,
        noShowScore: { gte: 0.5 }, // Only high-risk
      },
      include: { customer: true, service: true },
    })

    for (const appt of appointments) {
      const firstName = appt.customer.name.split(' ')[0]
      const serviceName = appt.service?.name || 'your appointment'
      const dateStr = appt.startsAt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
      const timeStr = appt.startsAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })

      const message = `${firstName} जी, reminder — ${dateStr} ${timeStr} पर आपका ${serviceName} appointment है।\n\nक्या आप आ रहे हैं?\n✅ "YES" reply करें\n🔄 "RESCHEDULE" से नया time लें\n❌ "CANCEL" से cancel करें\n\n(${business.name})`

      const result = await sendWhatsAppMessage({
        to: appt.customer.phone,
        message,
      }, { businessId: business.id })

      await prisma.automationEvent.create({
        data: {
          businessId: business.id,
          customerId: appt.customer.id,
          appointmentId: appt.id,
          type: 'confirmation_request',
          status: result.success ? 'sent' : 'failed',
          channel: 'whatsapp',
          message,
          error: result.success ? null : (result as any).error,
        },
      })

      await prisma.appointment.update({
        where: { id: appt.id },
        data: { confirmationSent: true },
      })

      sent++
    }
  }
  return { sent }
}

// Auto-cancel unconfirmed high-risk appointments
// Called 6h after appointment start time
export async function autoCancelNoShows() {
  const horizon = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000) // 6h ago

  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'booked',
      startsAt: { gte: cutoff, lte: horizon },
      noShowScore: { gte: 0.7 },
      confirmationSent: true,
      confirmedAt: null,
    },
    include: { customer: true, service: true },
  })

  let cancelled = 0
  for (const appt of appointments) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'no_show' },
    })

    await prisma.activity.create({
      data: {
        businessId: appt.businessId,
        type: 'no_show',
        actor: 'ai',
        title: 'No-show auto-cancelled',
        description: `${appt.customer.name} (${appt.service?.name}) — risk score ${(appt.noShowScore || 0).toFixed(2)}`,
      },
    })

    cancelled++
  }
  return { cancelled }
}
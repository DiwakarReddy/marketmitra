// Admin dashboard data layer — founder's view of the entire business

import { prisma } from '@/lib/db'

export interface AdminStats {
  totalBusinesses: number
  activeBusinesses: number
  trialBusinesses: number
  suspendedBusinesses: number
  mrrPaise: number
  arrPaise: number
  totalCustomers: number
  totalLeads: number
  totalBookings: number
  totalRevenuePaise: number
  totalCampaignsSent: number
  totalMessagesExchanged: number
  failedMessages: number
  pendingApprovals: number
  newSignupsLast7d: number
  newSignupsLast30d: number
  churnLast30d: number
  failedPaymentsCount: number
  failedPaymentsPaise: number
}

export async function getAdminStats(): Promise<AdminStats> {
  const now = new Date()
  const last7d = new Date(now.getTime() - 7 * 86400000)
  const last30d = new Date(now.getTime() - 30 * 86400000)

  const [
    totalBusinesses,
    activeBusinesses,
    trialBusinesses,
    suspendedBusinesses,
    totalCustomers,
    totalLeads,
    totalBookingsAgg,
    totalRevenueAgg,
    campaignsSent,
    messagesAgg,
    failedMessages,
    pendingApprovals,
    newSignups7d,
    newSignups30d,
    churn30d,
    failedPayments,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { plan: { notIn: ['suspended', 'trial'] }, onboardedAt: { not: null } } }),
    prisma.business.count({ where: { plan: 'trial' } }),
    prisma.business.count({ where: { plan: 'suspended' } }),
    prisma.customer.count({ where: { optedOut: false } }),
    prisma.lead.count(),
    prisma.appointment.aggregate({ _count: true, where: { status: { in: ['booked', 'completed', 'visited'] } } }),
    prisma.lead.aggregate({ _sum: { valuePaise: true }, where: { status: 'paid' } }),
    prisma.campaign.aggregate({ _count: true }),
    prisma.message.count(),
    prisma.failedMessage.count({ where: { status: { in: ['pending', 'dead'] } } }),
    prisma.approval.count({ where: { status: 'pending' } }),
    prisma.business.count({ where: { createdAt: { gte: last7d } } }),
    prisma.business.count({ where: { createdAt: { gte: last30d } } }),
    prisma.business.count({ where: { plan: 'suspended', updatedAt: { gte: last30d } } }),
    prisma.invoice.aggregate({ _count: true, _sum: { amountPaise: true }, where: { status: 'failed' } }),
  ])

  // MRR = sum of monthly subscriptions + estimated per-booking
  const subs = await prisma.business.findMany({
    where: { plan: { notIn: ['suspended', 'trial'] } },
    select: { monthlyPricePaise: true, perBookingPaise: true },
  })
  const baseMrr = subs.reduce((sum, b) => sum + (b.monthlyPricePaise || 0), 0)
  // Estimate per-booking contribution based on recent activity
  const recentBookings = await prisma.appointment.count({
    where: {
      status: { in: ['booked', 'completed', 'visited'] },
      createdAt: { gte: new Date(now.getTime() - 30 * 86400000) },
    },
  })
  const avgPerBooking = subs.length > 0 ? subs.reduce((s, b) => s + b.perBookingPaise, 0) / subs.length : 20000
  const mrrPaise = baseMrr + Math.round((recentBookings / 30) * avgPerBooking)
  const arrPaise = mrrPaise * 12

  return {
    totalBusinesses,
    activeBusinesses,
    trialBusinesses,
    suspendedBusinesses,
    mrrPaise,
    arrPaise,
    totalCustomers,
    totalLeads,
    totalBookings: totalBookingsAgg._count || 0,
    totalRevenuePaise: totalRevenueAgg._sum.valuePaise || 0,
    totalCampaignsSent: campaignsSent._count || 0,
    totalMessagesExchanged: messagesAgg || 0,
    failedMessages,
    pendingApprovals,
    newSignupsLast7d: newSignups7d,
    newSignupsLast30d: newSignups30d,
    churnLast30d: churn30d || 0,
    failedPaymentsCount: failedPayments._count || 0,
    failedPaymentsPaise: failedPayments._sum.amountPaise || 0,
  }
}

export async function getRecentBusinesses(limit = 20) {
  return prisma.business.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      ownerName: true,
      ownerEmail: true,
      city: true,
      plan: true,
      perBookingPaise: true,
      monthlyPricePaise: true,
      createdAt: true,
      onboardedAt: true,
      _count: {
        select: {
          customers: true,
          appointments: true,
          leads: true,
          campaigns: true,
        },
      },
    },
  })
}

export async function getRecentActivity(limit = 30) {
  return prisma.activity.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      business: { select: { name: true, ownerEmail: true } },
    },
  })
}
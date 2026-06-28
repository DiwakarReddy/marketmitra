// /api/me/sidebar-counts — Dynamic badge counts for the sidebar
// Replaces hardcoded badges (WhatsApp Inbox=3, Campaigns=12, Approvals=3)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const [inbox, campaigns, approvals, failures] = await Promise.all([
    prisma.conversation.count({ where: { businessId, unreadCount: { gt: 0 } } }),
    prisma.campaign.count({ where: { businessId, status: { in: ['draft', 'scheduled'] } } }),
    prisma.approval.count({ where: { businessId, status: 'pending' } }),
    prisma.failedMessage.count({ where: { businessId, status: 'pending' } }),
  ])

  return NextResponse.json({
    inbox,
    campaigns,
    approvals,
    failures,
  })
}
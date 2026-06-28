// /api/me/sidebar-counts — Dynamic badge counts for the sidebar
// Replaces hardcoded badges (WhatsApp Inbox=3, Campaigns=12, Approvals=3)
// Uses a SINGLE raw SQL query to avoid exhausting the Prisma connection pool
// in serverless (4 parallel Prisma.count() calls × multiple page renders = timeout).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  // Single query, multiple sub-aggregates. One connection, not four.
  const rows = await prisma.$queryRaw<{ inbox: bigint; campaigns: bigint; approvals: bigint; failures: bigint }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "Conversation" WHERE "businessId" = ${businessId} AND "unreadCount" > 0) AS inbox,
      (SELECT COUNT(*)::int FROM "Campaign"    WHERE "businessId" = ${businessId} AND "status" IN ('draft','scheduled')) AS campaigns,
      (SELECT COUNT(*)::int FROM "Approval"    WHERE "businessId" = ${businessId} AND "status" = 'pending') AS approvals,
      (SELECT COUNT(*)::int FROM "FailedMessage" WHERE "businessId" = ${businessId} AND "status" = 'pending') AS failures
  `

  const row = rows[0] || { inbox: 0n, campaigns: 0n, approvals: 0n, failures: 0n }
  return NextResponse.json({
    inbox: Number(row.inbox) || 0,
    campaigns: Number(row.campaigns) || 0,
    approvals: Number(row.approvals) || 0,
    failures: Number(row.failures) || 0,
  })
}
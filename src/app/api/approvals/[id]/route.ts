import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/approvals/[id] - Approve, reject, or schedule

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const { action, scheduledFor } = body // 'approve' | 'reject' | 'schedule'

  const approval = await prisma.approval.findUnique({ where: { id: params.id } })
  if (!approval || approval.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'approve' || action === 'schedule') {
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approverId: session.user.email,
      },
    })

    // Update the linked campaign if any
    if (approval.campaignId) {
      await prisma.campaign.update({
        where: { id: approval.campaignId },
        data: {
          status: scheduledFor ? 'scheduled' : 'running',
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          startedAt: !scheduledFor ? new Date() : null,
        },
      })
    }
  } else if (action === 'reject') {
    await prisma.approval.update({
      where: { id: approval.id },
      data: { status: 'rejected', rejectedAt: new Date() },
    })

    if (approval.campaignId) {
      await prisma.campaign.update({
        where: { id: approval.campaignId },
        data: { status: 'cancelled' },
      })
    }
  }

  return NextResponse.json({ ok: true })
}
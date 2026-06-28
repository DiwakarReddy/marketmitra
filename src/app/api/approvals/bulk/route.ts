import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/approvals/bulk
// Body: { ids: string[], action: 'approve' | 'reject' }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { ids, action } = await req.json()

  if (!Array.isArray(ids) || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await prisma.approval.updateMany({
    where: { id: { in: ids }, businessId, status: 'pending' },
    data: action === 'approve'
      ? { status: 'approved', approvedAt: new Date(), approverId: session.user.email }
      : { status: 'rejected', rejectedAt: new Date() },
  })

  return NextResponse.json({ ok: true, count: result.count })
}
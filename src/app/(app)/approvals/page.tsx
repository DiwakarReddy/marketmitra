import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ApprovalsClient } from './approvals-client'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const approvals = await prisma.approval.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return <ApprovalsClient initialApprovals={approvals as any} />
}
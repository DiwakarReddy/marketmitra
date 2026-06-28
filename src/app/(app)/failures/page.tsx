import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { FailuresClient } from './failures-client'

export const dynamic = 'force-dynamic'

export default async function FailuresPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [failures, allFailures, allResolved, byType] = await Promise.all([
    prisma.failedMessage.findMany({
      where: { businessId, status: { in: ['pending', 'dead', 'retrying'] } },
      orderBy: { lastAttemptAt: 'desc' },
      take: 100,
    }),
    prisma.failedMessage.count({ where: { businessId } }),
    prisma.failedMessage.count({ where: { businessId, status: 'sent' } }),
    prisma.failedMessage.groupBy({
      by: ['error'],
      where: { businessId, status: { in: ['dead', 'pending'] } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }),
  ])

  return (
    <FailuresClient
      initialFailures={failures as any}
      stats={{ total: allFailures, resolved: allResolved, byType: byType as any }}
    />
  )
}
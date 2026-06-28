import { Card } from '@/components/ui/card'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { InboxClient } from './inbox-client'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [conversations, counts] = await Promise.all([
    prisma.conversation.findMany({
      where: { businessId },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    }),
    {
      all: await prisma.conversation.count({ where: { businessId } }),
      ai: await prisma.conversation.count({ where: { businessId, status: 'ai_handling' } }),
      booked: await prisma.conversation.count({ where: { businessId, status: 'booked' } }),
      needs: await prisma.conversation.count({ where: { businessId, status: 'needs_human' } }),
      unread: await prisma.conversation.count({ where: { businessId, unreadCount: { gt: 0 } } }),
      today: await prisma.conversation.count({
        where: {
          businessId,
          lastMessageAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    },
  ])

  return <InboxClient initialConversations={conversations as any} initialCounts={counts} />
}
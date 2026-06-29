import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { InboxClient } from './inbox-client'
import { InboxNotConfigured } from './inbox-not-configured'
import { resolveChannel } from '@/lib/channel-resolver'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  // The inbox is shown if ANY channel is configured (WhatsApp, SMS, or Email).
  // Previously it required WhatsApp, but email/SMS-only businesses still need
  // to see and reply to their messages.
  const [wa, sms, email] = await Promise.all([
    resolveChannel(businessId, 'whatsapp').catch(() => null),
    resolveChannel(businessId, 'sms').catch(() => null),
    resolveChannel(businessId, 'email').catch(() => null),
  ])
  const anyChannel = !!(wa?.provider || sms?.provider || email?.provider)

  if (!anyChannel) {
    return <InboxNotConfigured />
  }

  // Pull conversations for ALL channels.
  const [conversations, allCount, aiCount, bookedCount, needsCount, unreadCount, todayCount] = await Promise.all([
    prisma.conversation.findMany({
      where: { businessId },
      include: {
        customer: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: 200,
    }),
    prisma.conversation.count({ where: { businessId } }),
    prisma.conversation.count({ where: { businessId, status: 'ai_handling' } }),
    prisma.conversation.count({ where: { businessId, status: 'booked' } }),
    prisma.conversation.count({ where: { businessId, status: 'needs_human' } }),
    prisma.conversation.count({ where: { businessId, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({
      where: {
        businessId,
        lastMessageAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ])

  const counts = {
    all: allCount,
    ai: aiCount,
    booked: bookedCount,
    needs: needsCount,
    unread: unreadCount,
    today: todayCount,
  }

  return <InboxClient initialConversations={conversations as any} initialCounts={counts} />
}
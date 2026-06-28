import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/inbox - List conversations with search + filter
// Query params: search, status, label, view (all|unread|today|booked|needs_you)

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const view = searchParams.get('view') || 'all'
  const label = searchParams.get('label') || ''

  const where: any = { businessId }
  if (status) where.status = status
  if (search) {
    where.customer = {
      OR: [
        { name: { contains: search } },
        { phone: { contains: search } },
      ],
    }
  }

  // View filters
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (view === 'unread') {
    where.unreadCount = { gt: 0 }
  } else if (view === 'today') {
    where.lastMessageAt = { gte: today, lt: tomorrow }
  } else if (view === 'booked') {
    where.status = 'booked'
  } else if (view === 'needs_you') {
    where.status = 'needs_human'
  } else if (view === 'ai') {
    where.status = 'ai_handling'
  }

  if (label) {
    where.labels = { contains: label }
  }

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      customer: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
  })

  // Counts for tabs
  const [allCount, aiCount, bookedCount, needsCount, unreadCount, todayCount] = await Promise.all([
    prisma.conversation.count({ where: { businessId } }),
    prisma.conversation.count({ where: { businessId, status: 'ai_handling' } }),
    prisma.conversation.count({ where: { businessId, status: 'booked' } }),
    prisma.conversation.count({ where: { businessId, status: 'needs_human' } }),
    prisma.conversation.count({ where: { businessId, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({ where: { businessId, lastMessageAt: { gte: today, lt: tomorrow } } }),
  ])

  return NextResponse.json({
    conversations,
    counts: { all: allCount, ai: aiCount, booked: bookedCount, needs: needsCount, unread: unreadCount, today: todayCount },
  })
}
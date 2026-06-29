import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/inbox - List conversations with search + filter + cursor pagination.
// Query params:
//   search    : free-text on customer name or phone
//   status    : exact status
//   view      : all|unread|today|booked|needs_you|ai
//   label     : contains
//   cursor    : opaque pagination token (lastMessageAt ISO of last item)
//   limit     : page size (default 50, max 200)
//
// We use cursor pagination keyed on (lastMessageAt, id) for stable
// ordering even when timestamps tie. This is the right pattern for
// the inbox — offset pagination would shift items as new messages
// arrive.

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
  const cursor = searchParams.get('cursor') || null
  const channel = searchParams.get('channel') || '' // 'whatsapp' | 'sms' | 'email' | '' (all)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200)

  const where: any = { businessId }
  if (status) where.status = status
  if (channel) where.channel = channel
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

  // Cursor: items older than (lastMessageAt, id). We use lastMessageAt DESC,
  // id DESC as the order key for stable pagination.
  if (cursor) {
    try {
      const [cursorTs, cursorId] = cursor.split('|')
      const cursorDate = new Date(cursorTs)
      if (!isNaN(cursorDate.getTime()) && cursorId) {
        // Show items strictly older than the cursor position.
        // OR (same timestamp, smaller id) handles ties.
        where.OR = [
          { lastMessageAt: { lt: cursorDate } },
          {
            lastMessageAt: cursorDate,
            id: { lt: cursorId },
          },
        ]
      }
    } catch {}
  }

  // Fetch one extra to know if there's a next page
  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      customer: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })

  const hasMore = conversations.length > limit
  const items = hasMore ? conversations.slice(0, limit) : conversations
  const last = items[items.length - 1]
  const nextCursor = hasMore && last ? `${last.lastMessageAt.toISOString()}|${last.id}` : null

  // Counts for tabs (run in parallel with the main query)
  const [allCount, aiCount, bookedCount, needsCount, unreadCount, todayCount] = await Promise.all([
    prisma.conversation.count({ where: { businessId } }),
    prisma.conversation.count({ where: { businessId, status: 'ai_handling' } }),
    prisma.conversation.count({ where: { businessId, status: 'booked' } }),
    prisma.conversation.count({ where: { businessId, status: 'needs_human' } }),
    prisma.conversation.count({ where: { businessId, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({ where: { businessId, lastMessageAt: { gte: today, lt: tomorrow } } }),
  ])

  return NextResponse.json({
    conversations: items,
    counts: { all: allCount, ai: aiCount, booked: bookedCount, needs: needsCount, unread: unreadCount, today: todayCount },
    pagination: { nextCursor, hasMore },
  })
}
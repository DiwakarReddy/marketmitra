import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendOutbound } from '@/lib/messaging-bus'

// GET /api/inbox/[id] - Get conversation + messages
// PATCH /api/inbox/[id] - Update notes, labels, status, assignedTo
// POST /api/inbox/[id] - Send a message as owner (take over)

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  })

  if (!conversation || conversation.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Mark as read
  if (conversation.unreadCount > 0) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    })
  }

  return NextResponse.json({ conversation })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const body = await req.json()

  const conversation = await prisma.conversation.findUnique({ where: { id: params.id } })
  if (!conversation || conversation.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updates: any = {}
  if ('internalNotes' in body) updates.internalNotes = body.internalNotes
  if ('labels' in body) updates.labels = body.labels
  if ('status' in body) updates.status = body.status
  if ('assignedTo' in body) updates.assignedTo = body.assignedTo
  if ('aiActive' in body) updates.aiActive = body.aiActive

  const updated = await prisma.conversation.update({
    where: { id: conversation.id },
    data: updates,
  })

  return NextResponse.json({ ok: true, conversation: updated })
}

/**
 * POST /api/inbox/[id]
 *
 * Owner-take-over: send a manual message. Routes through the messaging
 * bus so the message goes via the SAME channel as the conversation
 * (whatsapp | sms | email — email requires subject + html). This means
 * an owner reply to an SMS thread is sent as SMS, not WhatsApp.
 *
 * Body:
 *   - message: string (required for whatsapp/sms)
 *   - subject, html: optional, required when conversation.channel === 'email'
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const body = await req.json()
  const message = (body.message || '').toString()

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { customer: true },
  })
  if (!conversation || conversation.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const channel = (conversation.channel || 'whatsapp') as 'whatsapp' | 'sms' | 'email'

  if (channel === 'email') {
    if (!body.subject || !body.html) {
      return NextResponse.json({ error: 'Email replies require subject and html' }, { status: 400 })
    }
  } else if (!message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  // Send via the messaging bus — picks the right provider for the channel
  const result = await sendOutbound({
    businessId,
    customerId: conversation.customerId,
    channels: [channel],
    message: message,
    subject: body.subject,
    html: body.html,
    text: message,
    source: 'broadcast', // manual owner message — distinguish from ai replies
    noRetry: false,
  })

  if (!result.sent) {
    return NextResponse.json({
      error: result.error || 'Send failed',
      attempts: result.attempts,
    }, { status: 502 })
  }

  // Persist the outbound message in the conversation
  const saved = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'outbound',
      sender: 'human',
      content: channel === 'email' ? (body.text || body.html || '') : message,
      externalId: result.messageId,
      deliveryStatus: 'sent',
    },
  })

  // Mark as taken over
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: 'human_handling', aiActive: false },
  })

  return NextResponse.json({ ok: true, message: saved, sent: result })
}
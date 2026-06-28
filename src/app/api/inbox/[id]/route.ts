import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { message } = await req.json()

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    include: { customer: true },
  })
  if (!conversation || conversation.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Send via WhatsApp
  const { sendWhatsAppMessage } = await import('@/lib/whatsapp')
  const result = await sendWhatsAppMessage({
    to: conversation.customer.phone,
    message,
  }, { businessId: businessId })

  // Save message
  const saved = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: 'outbound',
      sender: 'human',
      content: message,
    },
  })

  // Mark as taken over
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), status: 'human_handling', aiActive: false },
  })

  return NextResponse.json({ ok: result.success, message: saved })
}
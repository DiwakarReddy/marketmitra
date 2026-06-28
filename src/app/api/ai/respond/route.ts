import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateAIReply } from '@/lib/ai'

// POST /api/ai/respond
// Manually invoke AI to generate a reply for a given message
// Useful for testing, training, or when you want to preview what AI would say

export async function POST(req: NextRequest) {
  try {
    const { conversationId, message } = await req.json()

    if (!conversationId || !message) {
      return NextResponse.json({ error: 'conversationId and message required' }, { status: 400 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        business: { include: { services: { where: { active: true } }, hours: true } },
        customer: true,
        messages: { orderBy: { createdAt: 'asc' }, take: 20 },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const b = conversation.business
    const reply = await generateAIReply(
      {
        businessName: b.name,
        vertical: b.vertical,
        city: b.city,
        ownerName: b.ownerName,
        language: b.language,
        services: b.services.map((s) => ({ name: s.name, durationMin: s.durationMin, pricePaise: s.pricePaise })),
        hours: b.hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, closed: h.closed })),
        knowledge: b.knowledge || undefined,
        customerName: conversation.customer.name,
        customerPhone: conversation.customer.phone,
      },
      conversation.messages.map((m) => ({
        role: m.sender === 'customer' ? 'customer' : 'assistant',
        content: m.content,
      })),
      message
    )

    return NextResponse.json({ ok: true, reply })
  } catch (err) {
    console.error('[AI respond error]', err)
    return NextResponse.json({ error: 'Failed to generate reply' }, { status: 500 })
  }
}
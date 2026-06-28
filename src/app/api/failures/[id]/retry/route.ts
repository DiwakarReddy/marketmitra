import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// POST /api/failures/:id/retry - Manually retry a failed message

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const failure = await prisma.failedMessage.findUnique({ where: { id: params.id } })
  if (!failure || failure.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Try to resend
  const result = await sendWhatsAppMessage({
    to: failure.phone,
    message: failure.message,
  }, { businessId: businessId })

  if (result.success) {
    await prisma.failedMessage.update({
      where: { id: failure.id },
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        resolvedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, retried: true, sent: true })
  } else {
    await prisma.failedMessage.update({
      where: { id: failure.id },
      data: {
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        error: result.error || 'Unknown error',
      },
    })
    return NextResponse.json({ ok: true, retried: true, sent: false, error: result.error })
  }
}
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  await prisma.business.update({
    where: { id: businessId },
    data: { pausedAt: new Date() },
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'account_paused',
      actor: 'owner',
      title: 'Account paused',
      description: 'AI automations stopped by owner',
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  await prisma.business.update({
    where: { id: businessId },
    data: { pausedAt: null },
  })

  return NextResponse.json({ ok: true })
}
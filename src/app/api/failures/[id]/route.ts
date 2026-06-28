import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// DELETE /api/failures/:id - Mark as dead/give up

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const failure = await prisma.failedMessage.findUnique({ where: { id: params.id } })
  if (!failure || failure.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.failedMessage.update({
    where: { id: failure.id },
    data: { status: 'dead' },
  })

  return NextResponse.json({ ok: true })
}
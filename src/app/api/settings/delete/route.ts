import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Permanently delete business and all related data
// GDPR-style right to be forgotten

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  // Soft-delete first: set deletedAt, then schedule hard delete
  // (We don't hard-delete in case of accidental click)

  await prisma.business.update({
    where: { id: businessId },
    data: { deletedAt: new Date() },
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'account_deletion_requested',
      actor: 'owner',
      title: 'Account deletion requested',
      description: '30-day grace period. Email support@marketmitra.com to cancel.',
    },
  })

  return NextResponse.json({ ok: true, message: '30-day grace period started' })
}
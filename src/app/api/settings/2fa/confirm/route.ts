import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyTOTP } from '@/lib/totp'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { code } = await req.json()

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business?.twoFactorSecret) {
    return NextResponse.json({ error: 'No pending 2FA setup' }, { status: 400 })
  }

  if (!verifyTOTP(code, business.twoFactorSecret)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }

  await prisma.business.update({
    where: { id: businessId },
    data: { twoFactorEnabled: true },
  })

  return NextResponse.json({ ok: true })
}
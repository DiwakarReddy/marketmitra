import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateSecret, generateOTPAuthURI, verifyTOTP } from '@/lib/totp'
import QRCode from 'qrcode'

// POST /api/settings/2fa - Initiate 2FA setup (returns QR + secret)
// POST /api/settings/2fa/confirm - Confirm with code, enables 2FA
// DELETE /api/settings/2fa - Disable 2FA

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const url = new URL(req.url)
  const action = url.pathname.split('/').pop()

  if (action === 'confirm') {
    // Confirm 2FA setup with user-entered code
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

  // Initiate: generate secret + QR
  const secret = generateSecret()
  const otpauth = generateOTPAuthURI(secret, session.user.email || 'user')
  const qrCode = await QRCode.toDataURL(otpauth)

  await prisma.business.update({
    where: { id: businessId },
    data: { twoFactorSecret: secret },
  })

  return NextResponse.json({ secret, qrCode, otpauth })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  await prisma.business.update({
    where: { id: businessId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  })

  return NextResponse.json({ ok: true })
}
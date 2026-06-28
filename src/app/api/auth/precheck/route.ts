// /api/auth/precheck — Lightweight check used by the login page to decide
// whether to show the 2FA code field BEFORE calling signIn().
// (Avoids relying on NextAuth's opaque "CredentialsSignin" error code.)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase().trim() },
      include: { business: { select: { twoFactorEnabled: true } } },
    })

    if (!user || !user.passwordHash) {
      // Don't leak whether the email exists
      return NextResponse.json({ valid: false })
    }

    const valid = await bcrypt.compare(String(password), user.passwordHash)
    if (!valid) return NextResponse.json({ valid: false })

    return NextResponse.json({
      valid: true,
      needs2fa: !!user.business?.twoFactorEnabled,
    })
  } catch (err) {
    console.error('[auth/precheck] error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
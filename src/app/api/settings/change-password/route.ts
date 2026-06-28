import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { compare, hash } from 'bcryptjs'

// POST /api/settings/change-password
// { currentPassword, newPassword }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({ where: { email: session.user.email } })
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const valid = await compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const newHash = await hash(newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  })

  return NextResponse.json({ ok: true })
}
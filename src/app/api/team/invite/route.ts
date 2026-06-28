import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/email'

// POST /api/team/invite - Invite a team member
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { email, role } = await req.json()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const validRoles = ['manager', 'viewer']
  const inviteRole = validRoles.includes(role) ? role : 'viewer'

  // Check if user already exists in this business
  const existing = await prisma.user.findFirst({ where: { email, businessId } })
  if (existing) {
    return NextResponse.json({ error: 'User already on team' }, { status: 400 })
  }

  // Check if pending invite already
  const existingInvite = await prisma.teamInvite.findFirst({
    where: { businessId, email, acceptedAt: null },
  })
  if (existingInvite && existingInvite.expiresAt > new Date()) {
    return NextResponse.json({ error: 'Invite already pending' }, { status: 400 })
  }

  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 86400000) // 7 days

  const invite = await prisma.teamInvite.create({
    data: {
      businessId,
      email,
      role: inviteRole,
      token,
      expiresAt,
      invitedBy: session.user.email,
    },
  })

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  const acceptUrl = `${process.env.APP_URL || 'http://localhost:3000'}/invite/${token}`

  // Send email
  await sendEmail({
    to: email,
    subject: `${session.user.name || 'Someone'} invited you to ${business?.name}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Join ${business?.name} on MarketMitra</h2>
        <p>${session.user.name || 'A team owner'} has invited you to join ${business?.name}'s team as a <strong>${inviteRole}</strong>.</p>
        <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">Accept invite →</a>
        <p style="color: #64748b; font-size: 12px;">This link expires in 7 days.</p>
      </div>
    `,
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'team_invited',
      actor: 'owner',
      title: `Invited ${email} as ${inviteRole}`,
    },
  })

  return NextResponse.json({ ok: true, invite: { id: invite.id, email, role: inviteRole, expiresAt } })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const [members, invites] = await Promise.all([
    prisma.user.findMany({
      where: { businessId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.teamInvite.findMany({
      where: { businessId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({ members, invites })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { id } = await req.json()

  await prisma.teamInvite.delete({ where: { id, businessId } })
  return NextResponse.json({ ok: true })
}
'use server'

import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'

export async function acceptInvite(token: string) {
  const invite = await prisma.teamInvite.findUnique({ where: { token } })
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return { error: 'Invalid or expired invite' }
  }

  // Check if user already exists
  const existing = await prisma.user.findFirst({ where: { email: invite.email } })

  if (existing) {
    // Add to business
    await prisma.user.update({
      where: { id: existing.id },
      data: { businessId: invite.businessId, role: invite.role },
    })
  } else {
    // Create placeholder user (will set password on signup)
    await prisma.user.create({
      data: {
        email: invite.email,
        businessId: invite.businessId,
        role: invite.role,
      },
    })
  }

  await prisma.teamInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  })

  redirect('/login?invited=1')
}
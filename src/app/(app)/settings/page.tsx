import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SettingsClient } from './settings-client'
import { TeamSettings } from './team-settings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [business, teamMembers, pendingInvites] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.user.findMany({
      where: { businessId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    prisma.teamInvite.findMany({
      where: { businessId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (!business) return <div className="p-6">Business not found</div>

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">Settings</h1>
        <p className="text-ink-600 mt-1">Manage your business, integrations, team, and automations.</p>
      </div>

      <SettingsClient business={business as any} />

      <TeamSettings
        businessId={businessId}
        members={teamMembers as any}
        invites={pendingInvites as any}
        isOwner={session?.user?.email === business.ownerEmail}
      />
    </div>
  )
}
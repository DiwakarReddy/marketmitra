import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAdminStats, getRecentBusinesses, getRecentActivity } from '@/lib/admin'

// GET /api/admin/stats - Founder-only view of entire business
// Restricted to admin email (set ADMIN_EMAIL env var)

export async function GET() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user || (adminEmail && session.user.email !== adminEmail)) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 })
  }

  const [stats, businesses, activity] = await Promise.all([
    getAdminStats(),
    getRecentBusinesses(20),
    getRecentActivity(30),
  ])

  return NextResponse.json({ stats, businesses, activity })
}
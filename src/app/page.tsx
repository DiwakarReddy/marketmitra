import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Root route - smart redirect based on auth + business state
//   Not logged in           → /login
//   Logged in + deleted     → /login?error=account_deleted (cannot recover)
//   Logged in + suspended   → /billing?status=suspended
//   Logged in + trial expired → /plans (encourage upgrade)
//   Logged in + not onboarded → /onboarding
//   Logged in + paused      → /dashboard?paused=1 (user can unpause)
//   Logged in + ready       → /dashboard

export default async function RootPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const businessId = (session as any).businessId
  if (!businessId) redirect('/login')

  const { prisma } = await import('@/lib/db')
  let business
  try {
    business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        plan: true,
        onboardedAt: true,
        pausedAt: true,
        deletedAt: true,
        trialEndsAt: true,
        // For suspended check via dunning
        invoices: {
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  } catch (err) {
    console.error('[RootPage] DB error:', err)
    redirect('/login?error=db_error')
  }

  if (!business) redirect('/login?error=business_not_found')

  // Deleted → permanent, go to login with error
  if (business.deletedAt) redirect('/login?error=account_deleted')

  // Suspended (dunning failed) → billing
  if (business.plan === 'suspended') redirect('/billing?status=suspended')

  // Trial expired
  if (business.trialEndsAt && business.trialEndsAt < new Date() && business.plan === 'trial') {
    redirect('/plans?reason=trial_expired')
  }

  // Not onboarded yet
  if (!business.onboardedAt) redirect('/onboarding')

  // Paused — still allow dashboard, just with paused banner
  if (business.pausedAt) redirect('/dashboard?paused=1')

  redirect('/dashboard')
}
// /api/ai/usage
//   GET : current usage for the business's plan (used / included / overage)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAIGuardStatus } from '@/lib/ai-guard'
import { getCacheStats } from '@/lib/cache'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const [usage, cache] = await Promise.all([
    getAIGuardStatus(businessId),
    Promise.resolve(getCacheStats()),
  ])

  return NextResponse.json({ usage, cache })
}

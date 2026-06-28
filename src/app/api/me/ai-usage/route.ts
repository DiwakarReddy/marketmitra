// GET /api/me/ai-usage - Get current AI usage for the business
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAIUsage } from '@/lib/automation/ai-usage'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const usage = await getAIUsage((session as any).businessId)
  if (!usage) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(usage)
}
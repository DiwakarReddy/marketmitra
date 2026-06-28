import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { startABTest, analyzeABTest } from '@/lib/abtest'

// POST /api/campaigns/abtest - Start an A/B test
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { name, variantA, variantB, audience, campaignId } = await req.json()

  // If campaignId provided, analyze existing test
  if (campaignId) {
    const result = await analyzeABTest(campaignId)
    return NextResponse.json({ ok: true, ...result })
  }

  if (!name || !variantA?.messageBody || !variantB?.messageBody) {
    return NextResponse.json({ error: 'name, variantA.messageBody, variantB.messageBody required' }, { status: 400 })
  }

  const result = await startABTest({
    businessId,
    name,
    variantA,
    variantB,
    audience: audience || {},
  })

  return NextResponse.json({ ok: true, ...result })
}
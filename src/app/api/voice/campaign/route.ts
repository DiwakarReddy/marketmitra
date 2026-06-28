import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { runReactivationCampaign } from '@/lib/twilio'

// POST /api/voice/campaign - Launch a voice reactivation campaign

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { campaignName, script, inactiveSinceDays } = await req.json()
  const businessId = (session as any).businessId

  if (!campaignName || !script) {
    return NextResponse.json({ error: 'campaignName and script required' }, { status: 400 })
  }

  const baseUrl = process.env.APP_URL || `https://${req.headers.get('host')}`

  const result = await runReactivationCampaign({
    businessId,
    campaignName,
    script,
    inactiveSinceDays: inactiveSinceDays || 90,
    webhookUrl: baseUrl,
  })

  return NextResponse.json({ ok: true, ...result })
}
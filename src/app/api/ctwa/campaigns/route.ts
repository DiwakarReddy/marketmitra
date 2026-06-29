// /api/ctwa/campaigns
//   GET  : list all CTWA campaigns for business
//   POST : create new CTWA campaign (calls Meta Marketing API)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/kms'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { createCTWACampaign } from '@/lib/ctwa'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const campaigns = await prisma.cTWACampaign.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ campaigns })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'ctwaCreate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const {
    name, phoneNumber, welcomeMessage, adHeadline, adBody, adImageUrl,
    audience, dailyBudgetPaise, pageId, adAccountId,
  } = body

  // Validation
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!phoneNumber || !welcomeMessage) {
    return NextResponse.json({ error: 'phoneNumber and welcomeMessage required' }, { status: 400 })
  }
  if (!adHeadline || !adBody) {
    return NextResponse.json({ error: 'adHeadline and adBody required' }, { status: 400 })
  }
  if (!pageId || !adAccountId) {
    return NextResponse.json({ error: 'pageId and adAccountId required' }, { status: 400 })
  }

  // Get Meta access token from WhatsApp channel config (same Meta system user token)
  const waChannel = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: 'whatsapp' } },
  })
  if (!waChannel || waChannel.provider !== 'meta' || !waChannel.credentials) {
    return NextResponse.json({
      error: 'Meta WhatsApp channel not configured. CTWA requires the same Meta system user.',
    }, { status: 400 })
  }

  let credentials: any
  try {
    credentials = await decryptJSON<Record<string, string>>(waChannel.credentials, businessId)
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to decrypt Meta credentials' }, { status: 500 })
  }
  const accessToken = credentials.accessToken

  // Create in Meta
  let result
  try {
    result = await createCTWACampaign({
      accessToken,
      adAccountId,
      pageId,
      whatsappPhoneNumber: phoneNumber,
      welcomeMessage,
      adHeadline,
      adBody,
      imageUrl: adImageUrl,
      audience: audience || {},
      dailyBudgetPaise: dailyBudgetPaise || 50000,  // ₹500 default
      campaignName: name,
    })
  } catch (err: any) {
    return NextResponse.json({
      error: `Meta API error: ${err.message}`,
      metaCode: err.code,
    }, { status: 502 })
  }

  // Save locally
  const campaign = await prisma.cTWACampaign.create({
    data: {
      businessId,
      metaCampaignId: result.campaignId,
      metaAdSetId: result.adSetId,
      metaAdId: result.adId,
      metaCreativeId: result.adCreativeId,
      name,
      status: 'draft',
      phoneNumber,
      welcomeMessage,
      adHeadline,
      adBody,
      adImageUrl: adImageUrl || null,
      audience: audience ? JSON.stringify(audience) : null,
      budgetDailyPaise: dailyBudgetPaise || 50000,
    },
  })

  await prisma.activity.create({
    data: {
      businessId, type: 'ctwa_created', actor: 'owner',
      title: `CTWA campaign created: ${name}`,
      description: `Created in Meta (ad ID: ${result.adId}) — review in Meta Ads Manager before activating`,
    },
  })

  return NextResponse.json({ ok: true, campaign })
}
// /api/templates
//   GET  : list templates for current business
//   POST : create a new template

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { dbToTemplate, validateTemplate, extractTokens } from '@/lib/templates'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { searchParams } = new URL(req.url)
  const channel = searchParams.get('channel') || ''
  const category = searchParams.get('category') || ''
  const status = searchParams.get('status') || 'active'

  const where: any = { businessId, status }
  if (channel) where.channel = channel
  if (category) where.category = category

  const rows = await prisma.messageTemplate.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ templates: rows.map(dbToTemplate) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'customFieldCreate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const t = {
    businessId,
    name: body.name?.trim(),
    description: body.description?.trim() || null,
    channel: body.channel,
    category: body.category || 'marketing',
    body: body.body || null,
    metaTemplateName: body.metaTemplateName || null,
    smsBody: body.smsBody || null,
    emailSubject: body.emailSubject || null,
    emailHtml: body.emailHtml || null,
    emailText: body.emailText || null,
    status: body.status || 'active',
  }

  // Validate channel-specific rules
  const v = validateTemplate(t as any)
  if (!v.valid) {
    return NextResponse.json({ error: 'Validation failed', details: v.errors }, { status: 400 })
  }

  // Derive variables from all body fields
  const allText = [t.body, t.smsBody, t.emailSubject, t.emailHtml].filter(Boolean).join('\n')
  const variables = extractTokens(allText)

  try {
    const row = await prisma.messageTemplate.create({
      data: {
        ...t,
        variables: JSON.stringify(variables),
        metaTemplateConfig: body.metaTemplateConfig ? JSON.stringify(body.metaTemplateConfig) : null,
      },
    })
    return NextResponse.json({ ok: true, template: dbToTemplate(row) })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A template with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message || 'Create failed' }, { status: 500 })
  }
}

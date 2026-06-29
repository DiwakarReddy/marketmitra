// /api/drips/sequences
//   GET  : list all drip sequences for business
//   POST : create new sequence (with inline steps)
//   POST body supports:
//     - templateName (WhatsApp Meta-approved) OR
//     - templateId   (saved SMS/Email MessageTemplate) OR
//     - messageBody  (freeform; only OK for transactional re-engagement)
//
//     - channel: 'whatsapp' | 'sms' | 'email' (default 'whatsapp')
//     - delayHours: hours after previous step (or after enrollment)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { DRIP_TRIGGERS } from '@/lib/drips'

const VALID_CHANNELS = ['whatsapp', 'sms', 'email']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const sequences = await prisma.dripSequence.findMany({
    where: { businessId },
    include: {
      steps: { orderBy: { position: 'asc' } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ sequences })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'dripCreate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const { name, description, trigger, triggerConfig, steps } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!DRIP_TRIGGERS.includes(trigger)) {
    return NextResponse.json({ error: `trigger must be one of: ${DRIP_TRIGGERS.join(', ')}` }, { status: 400 })
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: 'at least one step required' }, { status: 400 })
  }

  // Validate steps + verify referenced templates exist
  const templateIds = steps.filter((s: any) => s.templateId).map((s: any) => s.templateId)
  let templateMap = new Map<string, any>()
  if (templateIds.length) {
    const tpls = await prisma.messageTemplate.findMany({
      where: { id: { in: templateIds }, businessId },
    })
    templateMap = new Map(tpls.map((t) => [t.id, t]))
  }

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    if (typeof s.delayHours !== 'number' || s.delayHours < 0) {
      return NextResponse.json({ error: `step ${i + 1}: delayHours must be a non-negative number` }, { status: 400 })
    }
    if (s.channel && !VALID_CHANNELS.includes(s.channel)) {
      return NextResponse.json({ error: `step ${i + 1}: channel must be whatsapp, sms, or email` }, { status: 400 })
    }
    if (!s.templateName && !s.templateId && !s.messageBody) {
      return NextResponse.json({ error: `step ${i + 1}: provide templateName, templateId, or messageBody` }, { status: 400 })
    }
    if (s.templateId && !templateMap.has(s.templateId)) {
      return NextResponse.json({ error: `step ${i + 1}: templateId not found` }, { status: 400 })
    }
  }

  const sequence = await prisma.dripSequence.create({
    data: {
      businessId,
      name: name.trim(),
      description: description?.trim() || null,
      trigger,
      triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
      status: 'active',
      steps: {
        create: steps.map((s: any, idx: number) => ({
          position: idx,
          delayHours: s.delayHours,
          channel: s.channel || 'whatsapp',
          templateName: s.templateName || null,
          templateLang: s.templateLang || 'en',
          templateParams: s.templateParams ? JSON.stringify(s.templateParams) : null,
          messageBody: s.messageBody || null,
          templateId: s.templateId || null,
        })),
      },
    },
    include: { steps: { orderBy: { position: 'asc' } } },
  })

  await prisma.activity.create({
    data: {
      businessId, type: 'drip_created', actor: 'owner',
      title: `Drip sequence created: ${sequence.name}`,
      description: `${sequence.steps.length} steps · triggers on ${trigger}`,
    },
  })

  return NextResponse.json({ ok: true, sequence })
}
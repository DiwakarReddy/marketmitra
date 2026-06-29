// /api/campaigns
//   GET  : list campaigns for the business
//   POST : create a campaign. If `templateId` is provided, the campaign
//          renders the template for each customer and sends via the
//          template's channel via messaging-bus. Otherwise the legacy
//          raw-messageBody path is used (still multi-channel).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { getReactivationMessage } from '@/lib/prompts'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import {
  dbToTemplate,
  bulkRenderTemplate,
} from '@/lib/templates'
import { sendOutbound } from '@/lib/messaging-bus'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const campaigns = await prisma.campaign.findMany({
    where: { businessId },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ campaigns })
}

/**
 * Resolve the audience preset (e.g. "all", "vip") into a list of
 * customer IDs that match it. Used by both create + send paths so
 * the logic doesn't drift.
 */
async function resolveAudience(
  businessId: string,
  audience: string,
  take = 5000
): Promise<string[]> {
  const where: any = { businessId, optedOut: false }

  if (audience === 'vip') {
    where.totalVisits = { gte: 10 }
  } else if (audience === 'inactive') {
    where.lastVisitAt = { lt: new Date(Date.now() - 90 * 86400000) }
  } else if (audience === 'new') {
    where.totalVisits = 1
  } else if (audience?.startsWith('tag:')) {
    where.tags = { contains: audience.slice(4) }
  } else if (audience === 'birthday_this_month') {
    // Crude month-match — Prisma doesn't support EXTRACT on Date easily,
    // so we filter in JS after fetching candidates.
    const month = new Date().getMonth() + 1
    const candidates = await prisma.customer.findMany({
      where: { businessId, optedOut: false, birthday: { not: null } },
      select: { id: true, birthday: true },
      take,
    })
    return candidates
      .filter((c) => c.birthday && new Date(c.birthday).getMonth() + 1 === month)
      .map((c) => c.id)
  } else if (audience === 'anniversary_this_month') {
    const month = new Date().getMonth() + 1
    const candidates = await prisma.customer.findMany({
      where: { businessId, optedOut: false, anniversary: { not: null } },
      select: { id: true, anniversary: true },
      take,
    })
    return candidates
      .filter((c) => c.anniversary && new Date(c.anniversary).getMonth() + 1 === month)
      .map((c) => c.id)
  }

  const rows = await prisma.customer.findMany({
    where,
    select: { id: true },
    take,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map((r) => r.id)
}

export { resolveAudience }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'sendMessage')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const data = await req.json()
  const { name, type, channels, audience, messageBody, budgetPaise, scheduledFor, templateId, runABTest, variantB } = data

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }
  if (!messageBody?.trim() && !templateId) {
    return NextResponse.json({ error: 'Provide messageBody or templateId' }, { status: 400 })
  }
  if (name.trim().length > 120) {
    return NextResponse.json({ error: 'Campaign name too long (max 120 chars)' }, { status: 400 })
  }

  // If templateId supplied, derive the channel from the template.
  // Channel list is informational only — the bus picks channel from
  // the rendered template.
  let resolvedChannels = channels
  if (templateId) {
    const tpl = await prisma.messageTemplate.findFirst({
      where: { id: templateId, businessId },
    })
    if (!tpl) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    resolvedChannels = tpl.channel
  }

  const audienceIds = await resolveAudience(businessId, audience || 'all')
  const audienceCount = audienceIds.length

  const status = scheduledFor ? 'scheduled' : 'draft'

  const campaign = await prisma.campaign.create({
    data: {
      businessId,
      name,
      type: type || 'broadcast',
      status,
      channels: resolvedChannels || 'whatsapp',
      audience: audience || 'all',
      messageBody: messageBody || '',
      budgetPaise: budgetPaise || 0,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  })

  if (runABTest && variantB) {
    await prisma.campaign.create({
      data: {
        businessId,
        name: `${name} (Variant B)`,
        type: type || 'broadcast',
        status,
        channels: resolvedChannels || 'whatsapp',
        audience: audience || 'all',
        messageBody: variantB,
        budgetPaise: budgetPaise || 0,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      },
    })
  }

  await prisma.activity.create({
    data: {
      businessId,
      type: 'campaign_created',
      actor: 'owner',
      title: `Campaign "${name}" created`,
      description: `Audience: ${audienceCount} customers • ${type} • ${resolvedChannels}${templateId ? ' • via template' : ''}`,
    },
  })

  // Send-now (only if not scheduled and we have an audience)
  if (!scheduledFor && audienceIds.length > 0) {
    // Fire-and-forget so the API returns immediately even for 5k customers
    runCampaignSend(campaign.id, businessId, templateId, audienceIds, messageBody).catch((err) => {
      console.error('[campaign] send-now failed:', err)
    })
  }

  return NextResponse.json({ ok: true, campaign, audienceCount })
}

/**
 * Worker — sends a campaign's messages to its audience.
 * - If templateId is set: renders template per customer, sends via bus.
 * - Otherwise: sends raw messageBody on the listed channels.
 *   Uses messaging-bus so we get retry / dedupe / status tracking.
 *
 * Safe to call from a request handler or the cron tick.
 */
export async function runCampaignSend(
  campaignId: string,
  businessId: string,
  templateId: string | null | undefined,
  audienceIds: string[],
  messageBody?: string
): Promise<{ sent: number; failed: number; total: number }> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) return { sent: 0, failed: 0, total: 0 }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'running', startedAt: new Date() },
  })

  let sent = 0
  let failed = 0

  try {
    if (templateId) {
      const tpl = await prisma.messageTemplate.findFirst({
        where: { id: templateId, businessId },
      })
      if (!tpl) throw new Error('Template not found')
      const t = dbToTemplate(tpl)

      // Bulk render
      const render = await bulkRenderTemplate({
        template: t,
        customerIds: audienceIds,
        businessId,
        concurrency: 10,
        skipUnresolved: false,
      })

      // Send in parallel with bounded concurrency
      const sendConcurrency = 15
      let cursor = 0
      async function worker() {
        while (cursor < render.items.length) {
          const idx = cursor++
          const item = render.items[idx]
          if (!item.ok) {
            failed++
            continue
          }
          try {
            const r = item.rendered
            const result = await sendOutbound({
              businessId,
              customerId: item.customerId,
              channels: [t.channel as any],
              message: r.body || r.smsBody || '',
              subject: r.emailSubject,
              html: r.emailHtml,
              text: r.emailText,
              source: 'campaign',
              templateName: t.metaTemplateName || undefined,
              templateParams: r.metaTemplate?.params,
              templateLanguage: r.metaTemplate?.language,
              noRetry: true, // bulk send — don't auto-queue
            })
            if (result.sent) sent++
            else failed++
          } catch {
            failed++
          }
        }
      }
      await Promise.all(Array.from({ length: sendConcurrency }, () => worker()))
    } else {
      // Raw messageBody path — legacy. Multi-channel via bus.
      const channels = parseChannels(campaign.channels)
      const concurrency = 15
      let cursor = 0
      async function worker() {
        while (cursor < audienceIds.length) {
          const idx = cursor++
          const cid = audienceIds[idx]
          try {
            const r = await sendOutbound({
              businessId,
              customerId: cid,
              channels,
              message: messageBody || '',
              source: 'campaign',
              noRetry: true,
            })
            if (r.sent) sent++
            else failed++
          } catch {
            failed++
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: failed === audienceIds.length ? 'failed' : 'completed',
        leads: sent,
        endedAt: new Date(),
      },
    })

    await prisma.activity.create({
      data: {
        businessId,
        type: 'campaign_completed',
        actor: 'system',
        title: `Campaign "${campaign.name}" completed`,
        description: `Sent ${sent}, failed ${failed} of ${audienceIds.length}`,
      },
    })

    return { sent, failed, total: audienceIds.length }
  } catch (err) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'failed', endedAt: new Date() },
    })
    throw err
  }
}

function parseChannels(raw: any): ('whatsapp' | 'sms' | 'email')[] {
  if (!raw) return ['whatsapp']
  if (Array.isArray(raw)) return raw.filter((c) => ['whatsapp', 'sms', 'email'].includes(c)) as any
  if (typeof raw === 'string') {
    if (raw.trim().startsWith('[')) {
      try {
        const arr = JSON.parse(raw)
        return Array.isArray(arr) ? arr.filter((c) => ['whatsapp', 'sms', 'email'].includes(c)) : ['whatsapp']
      } catch { return ['whatsapp'] }
    }
    return raw.split(',').map((c) => c.trim()).filter((c) => ['whatsapp', 'sms', 'email'].includes(c)) as any
  }
  return ['whatsapp']
}
// /api/templates/bulk-send
//   POST { templateId, customerIds: string[], concurrency?, source? }
//   Renders for all customers, then sends each via the messaging bus.
//   Returns per-customer results.
//
// This is the workhorse for: broadcasts, drip enrollments, list sends.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, bulkRenderTemplate, recordTemplateUsage } from '@/lib/templates'
import { sendOutbound, type OutboundMessage } from '@/lib/messaging-bus'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'sendMessage')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const { templateId, customerIds, concurrency, source } = await req.json()
  if (!templateId || !Array.isArray(customerIds) || customerIds.length === 0) {
    return NextResponse.json({ error: 'templateId and customerIds[] required' }, { status: 400 })
  }
  if (customerIds.length > 5000) {
    return NextResponse.json({ error: 'Too many customers (max 5000 per call)' }, { status: 400 })
  }

  const row = await prisma.messageTemplate.findFirst({
    where: { id: templateId, businessId },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status !== 'active') {
    return NextResponse.json({ error: 'Template is not active' }, { status: 400 })
  }

  // 1. Bulk render
  const render = await bulkRenderTemplate({
    template: dbToTemplate(row),
    customerIds,
    businessId,
    concurrency,
    skipUnresolved: false, // we want to know which ones we couldn't render
  })

  // 2. Send each rendered item via the messaging bus.
  //    Use bounded concurrency to avoid hammering provider APIs.
  const sendConcurrency = Math.max(1, Math.min(concurrency ?? 10, 25))
  let cursor = 0
  const sent: any[] = []
  const failed: any[] = []

  async function worker() {
    while (cursor < render.items.length) {
      const idx = cursor++
      const item = render.items[idx]
      if (!item.ok) {
        failed.push({ customerId: item.customerId, error: item.error })
        continue
      }
      const t = dbToTemplate(row)
      const r = item.rendered
      const msg: OutboundMessage = {
        businessId,
        customerId: item.customerId,
        channels: [t.channel as any],
        message: r.body || r.smsBody || '',
        subject: r.emailSubject,
        html: r.emailHtml,
        text: r.emailText,
        source: source || 'system',
        templateName: t.metaTemplateName || undefined,
        templateParams: r.metaTemplate?.params,
        templateLanguage: r.metaTemplate?.language,
        noRetry: true, // bulk send — don't auto-queue to retry queue
      }
      try {
        const result = await sendOutbound(msg)
        if (result.sent) {
          sent.push({ customerId: item.customerId, channel: result.channel })
        } else {
          failed.push({ customerId: item.customerId, error: result.error || 'send failed' })
        }
      } catch (err: any) {
        failed.push({ customerId: item.customerId, error: err.message })
      }
    }
  }
  await Promise.all(Array.from({ length: sendConcurrency }, () => worker()))

  // 3. Track usage
  await recordTemplateUsage(row.id).catch(() => null)

  return NextResponse.json({
    ok: true,
    summary: {
      total: render.total,
      rendered: render.rendered,
      skipped: render.skipped,
      sent: sent.length,
      failed: failed.length,
    },
    sent,
    failed,
  })
}

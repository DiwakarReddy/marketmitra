// /api/templates/[id]/send
//   POST { customerId, appointmentId? }
//   Renders the template for the customer and sends via the appropriate channel.
//   Uses the messaging bus for unified routing + retry + delivery tracking.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, renderTemplateForCustomer, recordTemplateUsage } from '@/lib/templates'
import { sendOutbound, type OutboundMessage } from '@/lib/messaging-bus'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'sendMessage')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const { customerId, appointmentId, source } = await req.json()
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  }

  const row = await prisma.messageTemplate.findFirst({
    where: { id: params.id, businessId },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.status !== 'active') {
    return NextResponse.json({ error: 'Template is not active' }, { status: 400 })
  }

  try {
    const t = dbToTemplate(row)
    const rendered = await renderTemplateForCustomer(t, customerId, appointmentId)

    if (rendered.unresolved.length > 0) {
      return NextResponse.json({
        error: 'Template has unresolved tokens',
        unresolved: rendered.unresolved,
        rendered,
      }, { status: 400 })
    }

    // Build the outbound message based on channel
    const msg: OutboundMessage = {
      businessId,
      customerId,
      channels: [t.channel as any],
      message: rendered.body || rendered.smsBody || '',
      subject: rendered.emailSubject,
      html: rendered.emailHtml,
      text: rendered.emailText,
      source: source || 'system',
      templateName: t.metaTemplateName || undefined,
      templateParams: rendered.metaTemplate?.params,
      templateLanguage: rendered.metaTemplate?.language,
    }
    const result = await sendOutbound(msg)

    // Fire-and-forget usage tracking
    recordTemplateUsage(row.id).catch(() => null)

    return NextResponse.json({ ok: true, rendered, sent: result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Send failed' }, { status: 500 })
  }
}

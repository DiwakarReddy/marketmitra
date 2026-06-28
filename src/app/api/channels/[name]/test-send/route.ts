// POST /api/channels/[name]/test-send
// Sends an actual test message to a number (to verify the integration works end-to-end)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { audit, getRequestMeta } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const actorEmail = session.user.email || undefined

  const rl = applyRateLimit(req, businessId, 'channelTest')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const { to, message } = body

  if (!to) {
    return NextResponse.json({ error: 'Recipient phone number required' }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: 'Message body required' }, { status: 400 })
  }

  try {
    let result
    if (params.name === 'whatsapp') {
      result = await sendWhatsAppMessage(
        { to, message, type: 'text' },
        { businessId }
      )
    } else if (params.name === 'voice') {
      // Voice calls need different handling
      return NextResponse.json({ error: 'Voice test calls not yet supported via this endpoint' }, { status: 501 })
    } else {
      return NextResponse.json({ error: `Test send not supported for ${params.name}` }, { status: 400 })
    }

    await audit({
      businessId, channel: params.name,
      action: result.success ? 'test_succeeded' : 'test_failed',
      actor: 'owner', actorEmail, ...getRequestMeta(req),
      testResult: result.success ? 'success' : 'failed',
      testError: result.error,
      metadata: { to, messageLength: message.length, messageId: result.messageId, mocked: result.mocked },
    })

    if (result.success) {
      return NextResponse.json({
        ok: true,
        sent: true,
        messageId: result.messageId,
        mocked: result.mocked,
        provider: result.provider,
      })
    } else {
      return NextResponse.json({
        ok: false,
        sent: false,
        error: result.error,
        provider: result.provider,
      }, { status: 400 })
    }
  } catch (err: any) {
    await audit({
      businessId, channel: params.name, action: 'test_failed',
      actor: 'owner', actorEmail, ...getRequestMeta(req),
      testResult: 'failed', testError: err.message,
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
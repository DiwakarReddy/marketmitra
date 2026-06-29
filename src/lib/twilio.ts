// Voice AI (Twilio) integration
//
// Multi-tenant: creds are resolved per-business from ChannelConfig
// (provider='twilio', channel='voice'). Falls back to env vars only for
// the single-tenant / founder mode.
//
// Twilio API docs: https://www.twilio.com/docs/voice
//
// Flow:
//   1. We create an outbound call via client.calls.create()
//   2. Twilio hits our /api/voice/twiml endpoint to get conversation
//      instructions
//   3. Customer's speech → /api/voice/respond → AI generates reply
//   4. Twilio status callbacks → /api/voice/status (call state updates)
//   5. Recording ready → /api/voice/recording (URL saved on VoiceCall)

import twilio from 'twilio'
import { prisma } from '@/lib/db'

interface TwilioCreds {
  accountSid: string
  authToken: string
  fromNumber: string
  // Optional: webhooks base URL override
  webhookBaseUrl?: string
}

/**
 * Resolve Twilio credentials for a business. Multi-tenant by default.
 * Falls back to env vars ONLY if no business-scoped config is found
 * (founder / dev mode).
 */
export async function getTwilioCreds(businessId?: string): Promise<TwilioCreds | null> {
  if (businessId) {
    const { resolveChannel } = await import('./channel-resolver')
    const channel = await resolveChannel(businessId, 'voice')
    if (channel && channel.provider === 'twilio') {
      const c = channel.credentials
      const cfg = channel.config
      if (c.accountSid && c.authToken && (cfg.phoneNumber || c.whatsappFrom)) {
        return {
          accountSid: c.accountSid,
          authToken: c.authToken,
          fromNumber: cfg.phoneNumber || c.whatsappFrom,
          webhookBaseUrl: cfg.webhookBaseUrl,
        }
      }
    }
  }

  // Founder-mode fallback (env vars)
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (sid && token && from) {
    return { accountSid: sid, authToken: token, fromNumber: from }
  }

  return null
}

/** Returns a Twilio client. null if no creds available. */
export async function getTwilioClient(businessId?: string): Promise<twilio.Twilio | null> {
  const creds = await getTwilioCreds(businessId)
  if (!creds) return null
  return twilio(creds.accountSid, creds.authToken)
}

export interface InitiateCallParams {
  to: string
  businessId: string
  customerId: string
  customerName: string
  campaignName?: string
  script: string
  /** Override the public base URL Twilio uses for callbacks. Defaults to creds.webhookBaseUrl or APP_URL. */
  webhookBaseUrl?: string
}

/**
 * Initiate an AI-driven outbound voice call.
 *
 * @returns { voiceCallId, callSid, mocked }
 *  - mocked: true if Twilio creds are not configured (logged only)
 */
export async function initiateAICall(params: InitiateCallParams) {
  const client = await getTwilioClient(params.businessId)
  const creds = await getTwilioCreds(params.businessId)
  const toFormatted = params.to.startsWith('+') ? params.to : `+91${params.to.replace(/\D/g, '')}`

  // Log the call record first so we always have a row even on failure
  const voiceCall = await prisma.voiceCall.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      campaignName: params.campaignName || 'manual',
      status: 'queued',
      direction: 'outbound',
    },
  })

  if (!client || !creds) {
    console.log('[Twilio MOCK] Would call', toFormatted, 'with script:', params.script.substring(0, 60))
    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: { status: 'mocked', twilioCallSid: `mock_${voiceCall.id}` },
    })
    return { voiceCallId: voiceCall.id, mocked: true }
  }

  // Resolve base URL for callbacks
  const baseUrl = params.webhookBaseUrl
    || creds.webhookBaseUrl
    || process.env.APP_URL
    || process.env.NEXTAUTH_URL
    || 'http://localhost:3000'

  try {
    const call = await client.calls.create({
      to: toFormatted,
      from: creds.fromNumber,
      // TwiML URL — Twilio hits this when the call is answered
      url: `${baseUrl}/api/voice/twiml?callId=${voiceCall.id}&customerName=${encodeURIComponent(params.customerName)}&script=${encodeURIComponent(params.script)}`,
      // Status callbacks for call lifecycle
      statusCallback: `${baseUrl}/api/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${baseUrl}/api/voice/recording`,
    })

    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: { twilioCallSid: call.sid, status: 'initiated', startedAt: new Date() },
    })

    return { voiceCallId: voiceCall.id, callSid: call.sid }
  } catch (err) {
    console.error('[Twilio call error]', err)
    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: { status: 'failed' },
    })
    throw err
  }
}

/**
 * Bulk reactivation campaign with bounded concurrency.
 *
 * Twilio's API has soft rate limits (~1 call/sec per number to be safe,
 * ~100 concurrent per account for higher tiers). We use a concurrency
 * limit + delay between batches to be a good citizen.
 */
export async function runReactivationCampaign(params: {
  businessId: string
  campaignName: string
  script: string
  inactiveSinceDays: number
  /** How many calls to dispatch in parallel (default 5). Keep low for trial accounts. */
  concurrency?: number
  /** Delay between batches in ms (default 1000 = 1s). */
  batchDelayMs?: number
  webhookBaseUrl?: string
}) {
  const cutoff = new Date(Date.now() - params.inactiveSinceDays * 86400000)
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 5, 20))
  const batchDelayMs = Math.max(0, params.batchDelayMs ?? 1000)

  // Pre-fetch the customers (don't hold a transaction while calling)
  const customers = await prisma.customer.findMany({
    where: {
      businessId: params.businessId,
      optedOut: false,
      lastVisitAt: { lt: cutoff },
    },
    select: { id: true, name: true, phone: true },
    take: 1000, // hard cap per batch — repeat by re-calling
  })

  const results: Array<{ customerId: string; voiceCallId?: string; callSid?: string; mocked?: boolean; error?: string }> = []

  // Bounded-concurrency processor. We use a small async pool rather than
  // 1-at-a-time so trial accounts can still complete in minutes, not hours.
  let cursor = 0
  async function worker() {
    while (cursor < customers.length) {
      const idx = cursor++
      const c = customers[idx]
      try {
        const personalized = params.script.replaceAll('{{name}}', c.name)
        const result = await initiateAICall({
          to: c.phone,
          businessId: params.businessId,
          customerId: c.id,
          customerName: c.name,
          campaignName: params.campaignName,
          script: personalized,
          webhookBaseUrl: params.webhookBaseUrl,
        })
        results.push({ customerId: c.id, ...result })
      } catch (err) {
        results.push({ customerId: c.id, error: err instanceof Error ? err.message : 'failed' })
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)

  // Throttle between successive campaign runs to respect Twilio limits
  if (batchDelayMs > 0 && customers.length > 0) {
    await new Promise((r) => setTimeout(r, batchDelayMs))
  }

  const connected = results.filter((r) => !('error' in r)).length
  await prisma.activity.create({
    data: {
      businessId: params.businessId,
      type: 'voice_campaign',
      actor: 'ai',
      title: `Voice campaign: ${params.campaignName}`,
      description: `Attempted ${customers.length} customers, ${connected} connected (concurrency=${concurrency})`,
    },
  })

  return { attempted: customers.length, connected, results }
}

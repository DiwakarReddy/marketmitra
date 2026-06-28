import twilio from 'twilio'
import { prisma } from '@/lib/db'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromNumber = process.env.TWILIO_PHONE_NUMBER

export function getTwilio(): twilio.Twilio | null {
  if (!accountSid || !authToken || accountSid === '') return null
  return twilio(accountSid, authToken)
}

interface InitiateCallParams {
  to: string
  businessId: string
  customerId: string
  customerName: string
  campaignName?: string
  script: string
  webhookUrl: string
}

export async function initiateAICall(params: InitiateCallParams) {
  const client = getTwilio()
  const toFormatted = params.to.startsWith('+') ? params.to : `+91${params.to.replace(/\D/g, '')}`

  // Log the call record first
  const voiceCall = await prisma.voiceCall.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      campaignName: params.campaignName || 'manual',
      status: 'queued',
      direction: 'outbound',
    },
  })

  if (!client || !fromNumber) {
    console.log('[Twilio MOCK] Would call', toFormatted, 'with script:', params.script.substring(0, 60))
    // Update with mock state
    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: { status: 'mocked', twilioCallSid: `mock_${voiceCall.id}` },
    })
    return { voiceCallId: voiceCall.id, mocked: true }
  }

  try {
    const call = await client.calls.create({
      to: toFormatted,
      from: fromNumber,
      // TwiML for AI-driven call - points to our webhook for conversation handling
      url: `${params.webhookUrl}/api/voice/twiml?callId=${voiceCall.id}&customerName=${encodeURIComponent(params.customerName)}&script=${encodeURIComponent(params.script)}`,
      statusCallback: `${params.webhookUrl}/api/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: `${params.webhookUrl}/api/voice/recording`,
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

// Bulk reactivation campaign
export async function runReactivationCampaign(params: {
  businessId: string
  campaignName: string
  script: string
  inactiveSinceDays: number
  webhookUrl: string
}) {
  const cutoff = new Date(Date.now() - params.inactiveSinceDays * 86400000)

  const customers = await prisma.customer.findMany({
    where: {
      businessId: params.businessId,
      optedOut: false,
      lastVisitAt: { lt: cutoff },
    },
  })

  const results = []
  for (const c of customers) {
    try {
      const personalized = params.script.replaceAll('{{name}}', c.name)
      const result = await initiateAICall({
        to: c.phone,
        businessId: params.businessId,
        customerId: c.id,
        customerName: c.name,
        campaignName: params.campaignName,
        script: personalized,
        webhookUrl: params.webhookUrl,
      })
      results.push({ customerId: c.id, ...result })
      // Rate limit: 1 call per second to be safe
      await new Promise((r) => setTimeout(r, 1000))
    } catch (err) {
      results.push({ customerId: c.id, error: err instanceof Error ? err.message : 'failed' })
    }
  }

  await prisma.activity.create({
    data: {
      businessId: params.businessId,
      type: 'voice_campaign',
      actor: 'ai',
      title: `Voice campaign: ${params.campaignName}`,
      description: `Called ${results.length} customers, ${results.filter((r) => !('error' in r)).length} connected`,
    },
  })

  return { attempted: customers.length, results }
}
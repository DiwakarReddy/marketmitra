import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/integrations/[name]   - Connect an integration
// DELETE /api/integrations/[name] - Disconnect
// GET /api/integrations/[name]    - Get status

const CONFIGS: Record<string, {
  field: string
  connectedField: string
  label: string
  requiresCredentials: boolean
  envVars: string[]
}> = {
  whatsapp: {
    field: 'whatsappPhone',
    connectedField: 'whatsappConnected',
    label: 'WhatsApp Business',
    requiresCredentials: true,
    envVars: ['WHATSAPP_PROVIDER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
  },
  instagram: {
    field: 'instagramConnected',
    connectedField: 'instagramConnected',
    label: 'Instagram',
    requiresCredentials: true,
    envVars: ['INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ID'],
  },
  google: {
    field: 'googleAdsConnected',
    connectedField: 'googleAdsConnected',
    label: 'Google Ads',
    requiresCredentials: true,
    envVars: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'],
  },
  voice: {
    field: 'voiceConnected',
    connectedField: 'voiceConnected',
    label: 'Voice (Twilio)',
    requiresCredentials: true,
    envVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
  },
  google_calendar: {
    field: 'googleCalendarId',
    connectedField: 'googleCalendarId',
    label: 'Google Calendar',
    requiresCredentials: true,
    envVars: ['GOOGLE_CALENDAR_REFRESH_TOKEN'],
  },
  razorpay: {
    field: 'razorpayCustomerId',
    connectedField: 'razorpayCustomerId',
    label: 'Razorpay',
    requiresCredentials: true,
    envVars: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
  },
}

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cfg = CONFIGS[params.name]
  if (!cfg) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })

  // Check if env vars are set (server-side config)
  const envConfigured = cfg.envVars.every((v) => !!process.env[v]) || cfg.envVars.length === 0

  return NextResponse.json({
    name: params.name,
    label: cfg.label,
    envConfigured,
    envVars: cfg.envVars,
  })
}

export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const cfg = CONFIGS[params.name]
  if (!cfg) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })

  const body = await req.json()

  // For server-side integrations: validate env vars are set
  if (cfg.requiresCredentials) {
    const missing = cfg.envVars.filter((v) => !process.env[v])
    if (missing.length > 0 && !body.skipEnvCheck) {
      return NextResponse.json({
        error: 'Server credentials missing',
        details: `Set these env vars: ${missing.join(', ')}`,
        envVars: missing,
      }, { status: 400 })
    }
  }

  // Update business record
  const updates: any = {}
  if (params.name === 'whatsapp') {
    updates.whatsappConnected = true
    if (body.phoneNumber) updates.whatsappPhone = body.phoneNumber
  } else if (params.name === 'instagram') {
    updates.instagramConnected = true
  } else if (params.name === 'google') {
    updates.googleAdsConnected = true
  } else if (params.name === 'voice') {
    updates.voiceConnected = true
  } else if (params.name === 'google_calendar') {
    updates.googleCalendarId = body.calendarId || 'primary'
  } else if (params.name === 'razorpay') {
    updates.razorpayCustomerId = body.customerId || `cust_${businessId}`
  }

  await prisma.business.update({
    where: { id: businessId },
    data: updates,
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'integration_connected',
      actor: 'owner',
      title: `${cfg.label} connected`,
    },
  })

  return NextResponse.json({ ok: true, connected: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const cfg = CONFIGS[params.name]
  if (!cfg) return NextResponse.json({ error: 'Unknown integration' }, { status: 404 })

  const updates: any = {}
  if (params.name === 'whatsapp') updates.whatsappConnected = false
  else if (params.name === 'instagram') updates.instagramConnected = false
  else if (params.name === 'google') updates.googleAdsConnected = false
  else if (params.name === 'voice') updates.voiceConnected = false
  else if (params.name === 'google_calendar') updates.googleCalendarId = null
  else if (params.name === 'razorpay') updates.razorpayCustomerId = null

  await prisma.business.update({
    where: { id: businessId },
    data: updates,
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'integration_disconnected',
      actor: 'owner',
      title: `${cfg.label} disconnected`,
    },
  })

  return NextResponse.json({ ok: true, connected: false })
}
// /api/channels/[name] - Save credentials for a channel
// POST = save (creates or updates)
// DELETE = disconnect
// GET = get config (no secrets)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { encryptJSON, decryptJSON, mask } from '@/lib/kms'
import { getChannelSchema } from '@/lib/channel-schemas'
import { testChannelConnection } from '@/lib/channel-tester'
import { audit, getRequestMeta } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'
import { clearChannelCache } from '@/lib/channel-resolver'

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  // Rate limit
  const rl = applyRateLimit(req, businessId, 'channelList')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const schema = getChannelSchema(params.name)
  if (!schema) return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })

  const cfg = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: params.name } },
  })

  if (!cfg) {
    return NextResponse.json({ channel: params.name, connected: false })
  }

  // Decrypt and mask credentials for client display
  let maskedFields: Record<string, string> = {}
  if (cfg.credentials) {
    try {
      const creds = await decryptJSON<Record<string, string>>(cfg.credentials, businessId)
      for (const field of schema.fields) {
        if (creds[field.key]) {
          if (field.type === 'password') {
            maskedFields[field.key] = mask(creds[field.key])
          } else {
            maskedFields[field.key] = creds[field.key]
          }
        }
      }
    } catch (err) {
      // Decryption failed
    }
  }

  return NextResponse.json({
    channel: params.name,
    connected: cfg.isActive,
    provider: cfg.provider,
    values: maskedFields,
    config: cfg.config ? JSON.parse(cfg.config) : {},
    keyVersion: cfg.keyVersion,
    lastUsedAt: cfg.lastUsedAt,
    lastRotatedAt: cfg.lastRotatedAt,
    lastTestedAt: cfg.lastTestedAt,
    lastTestStatus: cfg.lastTestStatus,
    lastTestError: cfg.lastTestError,
    ageDays: cfg.lastRotatedAt
      ? Math.floor((Date.now() - new Date(cfg.lastRotatedAt).getTime()) / 86400000)
      : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const actorEmail = session.user.email || undefined

  // Rate limit
  const rl = applyRateLimit(req, businessId, 'channelConnect')
  if (!rl?.allowed) {
    await audit({
      businessId, channel: params.name, action: 'rate_limited',
      actor: 'owner', actorEmail,
      ...getRequestMeta(req),
      metadata: { endpoint: 'POST', limit: 'channelConnect' },
    })
    return rateLimitResponse(rl!)
  }

  const schema = getChannelSchema(params.name)
  if (!schema) return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })

  const body = await req.json()
  const { provider, values, skipTest } = body

  // Validate
  const errors: string[] = []
  for (const field of schema.fields) {
    if (field.required && (!values || !values[field.key] || (typeof values[field.key] === 'string' && values[field.key].startsWith('•')))) {
      errors.push(`${field.label} is required`)
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  if (schema.providers && provider) {
    const validProvider = schema.providers.find((p) => p.value === provider)
    if (!validProvider) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }
  }

  // Test connection
  let testResult: { success: boolean; error?: string } = { success: true }
  if (!skipTest) {
    testResult = await testChannelConnection(params.name, provider, values || {})
    if (!testResult.success) {
      await audit({
        businessId, channel: params.name, action: 'test_failed',
        actor: 'owner', actorEmail, ...getRequestMeta(req),
        testResult: 'failed', testError: testResult.error,
      })
      return NextResponse.json({
        error: 'Connection test failed',
        details: testResult.error,
        testFailed: true,
      }, { status: 400 })
    }
  }

  // Split into config (non-secret) and credentials (secret)
  const config: Record<string, any> = {}
  const credentials: Record<string, any> = {}
  const newFields: string[] = []
  const updatedFields: string[] = []

  for (const field of schema.fields) {
    if (!values || !values[field.key]) continue
    if (typeof values[field.key] === 'string' && values[field.key].startsWith('•')) continue
    if (field.type === 'password') {
      credentials[field.key] = values[field.key]
      newFields.push(field.key)
    } else {
      config[field.key] = values[field.key]
    }
  }

  // Upsert
  const existing = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: params.name } },
  })

  const isNew = !existing
  const isRotation: boolean = !!existing && Object.keys(credentials).length > 0

  const data: any = {
    provider: provider || existing?.provider,
    isActive: true,
    config: JSON.stringify(config),
    connectedAt: existing?.connectedAt || new Date(),
    lastTestedAt: new Date(),
    lastTestStatus: 'success',
    lastTestError: null,
  }

  if (Object.keys(credentials).length > 0) {
    data.credentials = await encryptJSON(credentials, businessId)
    data.keyVersion = (existing?.keyVersion || 0) + 1
    data.lastRotatedAt = new Date()
  }

  const saved = await prisma.channelConfig.upsert({
    where: { businessId_channel: { businessId, channel: params.name } },
    create: { businessId, channel: params.name, ...data },
    update: data,
  })

  // Clear resolver cache
  clearChannelCache(businessId, params.name)

  // Sync Business.* flags
  await syncBusinessFlags(businessId)

  // Audit
  await audit({
    businessId, channel: params.name,
    action: isNew ? 'created' : isRotation ? 'rotated' : 'updated',
    actor: 'owner', actorEmail, ...getRequestMeta(req),
    changes: { added: newFields, updated: updatedFields, rotated: isRotation },
    testResult: 'success',
    metadata: { provider: data.provider, keyVersion: data.keyVersion || 1 },
  })

  await prisma.activity.create({
    data: {
      businessId,
      type: 'channel_connected',
      actor: 'owner',
      title: `${schema.label} ${isNew ? 'connected' : isRotation ? 'credentials rotated' : 'updated'}`,
    },
  })

  return NextResponse.json({
    ok: true,
    connected: true,
    lastTestStatus: 'success',
    keyVersion: saved.keyVersion,
  })
}

export async function DELETE(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const actorEmail = session.user.email || undefined

  // Rate limit
  const rl = applyRateLimit(req, businessId, 'channelDelete')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const schema = getChannelSchema(params.name)

  await prisma.channelConfig.deleteMany({
    where: { businessId, channel: params.name },
  })

  clearChannelCache(businessId, params.name)
  await syncBusinessFlags(businessId)

  await audit({
    businessId, channel: params.name, action: 'deleted',
    actor: 'owner', actorEmail, ...getRequestMeta(req),
  })

  if (schema) {
    await prisma.activity.create({
      data: {
        businessId,
        type: 'channel_disconnected',
        actor: 'owner',
        title: `${schema.label} disconnected`,
      },
    })
  }

  return NextResponse.json({ ok: true, connected: false })
}

async function syncBusinessFlags(businessId: string) {
  const configs = await prisma.channelConfig.findMany({ where: { businessId, isActive: true } })
  const flags: any = {}
  for (const c of configs) {
    if (c.channel === 'whatsapp') {
      flags.whatsappConnected = true
      if (c.config) {
        try {
          const cfg = JSON.parse(c.config)
          flags.whatsappPhone = cfg.phoneNumberId || cfg.phoneNumber || null
        } catch {}
      }
    } else if (c.channel === 'instagram') flags.instagramConnected = true
    else if (c.channel === 'google_ads') flags.googleAdsConnected = true
    else if (c.channel === 'voice') flags.voiceConnected = true
    else if (c.channel === 'google_calendar') {
      try {
        const cfg = c.config ? JSON.parse(c.config) : {}
        flags.googleCalendarId = cfg.calendarId || 'primary'
      } catch {
        flags.googleCalendarId = 'primary'
      }
    } else if (c.channel === 'razorpay') {
      flags.razorpayCustomerId = 'cus_' + businessId.slice(-8)
    }
  }
  if (Object.keys(flags).length > 0) {
    await prisma.business.update({ where: { id: businessId }, data: flags })
  } else {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        whatsappConnected: false,
        instagramConnected: false,
        googleAdsConnected: false,
        voiceConnected: false,
        googleCalendarId: null,
        razorpayCustomerId: null,
      },
    })
  }
}
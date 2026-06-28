// /api/channels - List all channel configs for current business
// /api/channels/[name] - Get/set specific channel config

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { CHANNEL_SCHEMAS, CHANNEL_ORDER } from '@/lib/channel-schemas'

// GET /api/channels - List all channel configs (status only, no secrets)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const configs = await prisma.channelConfig.findMany({
    where: { businessId },
  })

  // Map to UI shape
  const result = CHANNEL_ORDER.map((channel) => {
    const cfg = configs.find((c) => c.channel === channel)
    const schema = CHANNEL_SCHEMAS[channel]
    return {
      channel,
      label: schema?.label || channel,
      icon: schema?.icon || '🔌',
      description: schema?.description || '',
      providers: schema?.providers,
      fields: schema?.fields || [],
      connected: !!cfg && cfg.isActive,
      provider: cfg?.provider,
      config: cfg ? safeParseJson(cfg.config) : null,
      hasCredentials: !!cfg?.credentials, // true/false, never the value
      lastTestedAt: cfg?.lastTestedAt,
      lastTestStatus: cfg?.lastTestStatus,
      lastTestError: cfg?.lastTestError,
      connectedAt: cfg?.connectedAt,
      // For Meta/WhatsApp, expose non-secret config to display
      displayValues: cfg ? extractDisplayValues(cfg.config, schema) : null,
    }
  })

  return NextResponse.json({ channels: result })
}

function safeParseJson(s: string | null): any {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

// Extract non-secret values to display in UI (phone number ID, customer ID, etc.)
function extractDisplayValues(configJson: string | null, schema: any): Record<string, string> {
  const config = safeParseJson(configJson)
  if (!config) return {}
  const result: Record<string, string> = {}
  for (const field of schema?.fields || []) {
    if (field.type !== 'password' && config[field.key]) {
      result[field.key] = config[field.key]
    }
  }
  return result
}
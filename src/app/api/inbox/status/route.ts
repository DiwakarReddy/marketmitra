// /api/inbox/status — Quick check: is WhatsApp configured for this business?
// Used by the inbox page to decide whether to show a fallback "configure WhatsApp"
// screen instead of the inbox.

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const channel = await prisma.channelConfig.findFirst({
    where: { businessId, channel: 'whatsapp', isActive: true },
    select: { provider: true, lastTestedAt: true, lastTestStatus: true, lastTestError: true, config: true },
  })

  const configured = !!channel && !!channel.provider
  const lastTested = channel?.lastTestedAt ? (channel.lastTestStatus === 'success') : false

  // Display config: phone number ID / display number (non-secret)
  let display: any = null
  if (channel?.config) {
    try {
      const cfg = JSON.parse(channel.config)
      display = {
        phoneNumberId: cfg.phoneNumberId,
        phoneNumber: cfg.phoneNumber,
        businessAccountId: cfg.businessAccountId,
      }
    } catch {}
  }

  return NextResponse.json({
    whatsapp: {
      configured,
      provider: channel?.provider || null,
      lastTested,
      lastTestedAt: channel?.lastTestedAt,
      lastTestError: channel?.lastTestError,
      display,
    },
  })
}
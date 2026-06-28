// GET /api/channels/[name]/audit - View audit log for a specific channel

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { name: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')

  const events = await prisma.channelConfigAudit.findMany({
    where: { businessId, channel: params.name },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ events })
}
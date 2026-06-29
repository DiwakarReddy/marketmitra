// /api/coexistence
//   GET  : check current Coexistence status for this business
//   POST : re-verify against Meta API (refreshes the cached status)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyCoexistence } from '@/lib/coexistence'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const [status, result] = await Promise.all([
    prisma.coexistenceStatus.findUnique({ where: { businessId } }),
    verifyCoexistence(businessId),
  ])

  return NextResponse.json({
    storedStatus: status,
    liveVerification: result,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json().catch(() => ({}))
  const phoneNumberId = body?.phoneNumberId

  const result = await verifyCoexistence(businessId, phoneNumberId)

  if (result.enabled && result.phoneNumber) {
    const { enableCoexistenceForBusiness } = await import('@/lib/coexistence')
    await enableCoexistenceForBusiness(businessId, {
      whatsappPhone: result.phoneNumber,
      wabaId: result.wabaId,
      notes: result.notes,
    })
  }

  return NextResponse.json({ ok: true, result })
}
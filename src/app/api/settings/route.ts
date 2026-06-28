import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const data = await req.json()

  // Whitelist of allowed fields
  const updates: any = {}
  const allowed = [
    'name',
    'ownerName',
    'city',
    'language',
    'googleReviewUrl',
    'reviewRequestDelayHours',
    'birthdayWishesEnabled',
    'festivalCampaignsEnabled',
    'confirmationsEnabled',
    'noShowPredictionEnabled',
    'wishOfferPercent',
  ]

  for (const key of allowed) {
    if (key in data) updates[key] = data[key]
  }

  await prisma.business.update({
    where: { id: businessId },
    data: updates,
  })

  return NextResponse.json({ ok: true })
}
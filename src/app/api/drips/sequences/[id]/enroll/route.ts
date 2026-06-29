// /api/drips/sequences/[id]/enroll
//   POST { customerIds: string[] } → enroll one or more customers
//                                    into the sequence right now.
//   Used by:
//     - "Trigger now" button on the drips page
//     - Backfilling a sequence for an existing customer
//     - Testing the sequence end-to-end before flipping a real trigger

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enrollCustomer } from '@/lib/drips'
import { applyRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'dripCreate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const { customerIds, skipActiveCheck } = body

  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return NextResponse.json({ error: 'customerIds[] required' }, { status: 400 })
  }
  if (customerIds.length > 500) {
    return NextResponse.json({ error: 'Max 500 customers per call' }, { status: 400 })
  }

  let enrolled = 0
  const skipped: { customerId: string; reason: string }[] = []
  for (const cid of customerIds) {
    const result = await enrollCustomer(params.id, cid, { skipActiveCheck })
    if (result.enrolled) enrolled++
    else skipped.push({ customerId: cid, reason: result.reason || 'unknown' })
  }

  return NextResponse.json({
    ok: true,
    requested: customerIds.length,
    enrolled,
    skipped,
  })
}
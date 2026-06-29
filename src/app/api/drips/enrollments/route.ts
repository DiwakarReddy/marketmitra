// /api/drips/enrollments
//   POST : manually enroll one or many customers in a sequence
//     Body: { sequenceId, customerIds: string[] }
//   GET  : list enrollments (with filters)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enrollCustomer, stopEnrollment } from '@/lib/drips'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { searchParams } = new URL(req.url)
  const sequenceId = searchParams.get('sequenceId')
  const status = searchParams.get('status')

  const enrollments = await prisma.dripEnrollment.findMany({
    where: {
      businessId,
      ...(sequenceId ? { sequenceId } : {}),
      ...(status ? { status } : {}),
    },
    include: {
      sequence: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { enrolledAt: 'desc' },
    take: 200,
  })

  return NextResponse.json({ enrollments })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json()
  const { sequenceId, customerIds } = body

  if (!sequenceId) return NextResponse.json({ error: 'sequenceId required' }, { status: 400 })
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return NextResponse.json({ error: 'customerIds must be a non-empty array' }, { status: 400 })
  }
  if (customerIds.length > 1000) {
    return NextResponse.json({ error: 'max 1000 customers per batch' }, { status: 400 })
  }

  // Verify sequence belongs to business
  const sequence = await prisma.dripSequence.findFirst({
    where: { id: sequenceId, businessId },
  })
  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  const results = { enrolled: 0, skipped: 0, errors: [] as string[] }
  for (const customerId of customerIds) {
    try {
      const r = await enrollCustomer(sequenceId, customerId)
      if (r.enrolled) results.enrolled++
      else results.skipped++
    } catch (err: any) {
      results.errors.push(`${customerId}: ${err.message}`)
    }
  }
  return NextResponse.json({ ok: true, ...results })
}
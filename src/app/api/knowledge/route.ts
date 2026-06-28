import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/knowledge - Get business knowledge base
// PUT /api/knowledge - Update knowledge base

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { knowledge: true },
  })

  return NextResponse.json({ knowledge: business?.knowledge || '' })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { knowledge } = await req.json()

  await prisma.business.update({
    where: { id: businessId },
    data: { knowledge },
  })

  return NextResponse.json({ ok: true })
}
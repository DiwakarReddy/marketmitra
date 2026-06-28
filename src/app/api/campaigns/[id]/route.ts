// /api/campaigns/[id]/send — Transition a campaign from draft → running
// Or scheduled → running immediately.
// Also returns the campaign details (for the eye-icon click → preview/edit modal).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fillTemplate } from '@/lib/template-engine'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const campaign = await prisma.campaign.findFirst({
    where: { id: params.id, businessId },
  })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  return NextResponse.json({ campaign })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json().catch(() => ({}))
  const allowed: any = {}
  for (const key of ['name', 'status', 'messageBody', 'audience', 'channels', 'scheduledFor', 'budgetPaise']) {
    if (body[key] !== undefined) allowed[key] = body[key]
  }
  if (allowed.scheduledFor === '' || allowed.scheduledFor === null) {
    allowed.scheduledFor = null
  } else if (allowed.scheduledFor) {
    allowed.scheduledFor = new Date(allowed.scheduledFor)
  }

  const existing = await prisma.campaign.findFirst({ where: { id: params.id, businessId } })
  if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: allowed,
  })

  return NextResponse.json({ ok: true, campaign })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.campaign.findFirst({ where: { id: params.id, businessId } })
  if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  await prisma.campaign.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
// /api/drips/sequences/[id]
//   GET    : full sequence detail
//   PATCH  : update name/description/status/steps
//   DELETE : delete sequence (and cascade enrollments)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { enrollCustomer } from '@/lib/drips'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const sequence = await prisma.dripSequence.findFirst({
    where: { id: params.id, businessId },
    include: {
      steps: { orderBy: { position: 'asc' } },
      enrollments: {
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { enrolledAt: 'desc' },
        take: 100,
      },
      _count: { select: { enrollments: true } },
    },
  })
  if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ sequence })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.dripSequence.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: any = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.status !== undefined && ['active', 'paused', 'archived'].includes(body.status)) {
    updates.status = body.status
  }
  if (body.trigger !== undefined) updates.trigger = body.trigger
  if (body.triggerConfig !== undefined) updates.triggerConfig = body.triggerConfig ? JSON.stringify(body.triggerConfig) : null

  // Full steps replacement if provided
  if (Array.isArray(body.steps)) {
    // Verify any referenced templates exist
    const tids = body.steps.filter((s: any) => s.templateId).map((s: any) => s.templateId)
    if (tids.length) {
      const found = await prisma.messageTemplate.count({
        where: { id: { in: tids }, businessId },
      })
      if (found !== new Set(tids).size) {
        return NextResponse.json({ error: 'One or more templateId values not found' }, { status: 400 })
      }
    }

    await prisma.$transaction([
      prisma.dripStep.deleteMany({ where: { sequenceId: params.id } }),
      prisma.dripStep.createMany({
        data: body.steps.map((s: any, idx: number) => ({
          sequenceId: params.id,
          position: idx,
          delayHours: s.delayHours,
          channel: s.channel || 'whatsapp',
          templateName: s.templateName || null,
          templateLang: s.templateLang || 'en',
          templateParams: s.templateParams ? JSON.stringify(s.templateParams) : null,
          messageBody: s.messageBody || null,
          templateId: s.templateId || null,
        })),
      }),
      prisma.dripSequence.update({ where: { id: params.id }, data: updates }),
    ])
    return NextResponse.json({ ok: true })
  }

  await prisma.dripSequence.update({ where: { id: params.id }, data: updates })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.dripSequence.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.dripSequence.delete({ where: { id: existing.id } })
  await prisma.activity.create({
    data: {
      businessId, type: 'drip_deleted', actor: 'owner',
      title: `Drip sequence deleted: ${existing.name}`,
    },
  })
  return NextResponse.json({ ok: true })
}
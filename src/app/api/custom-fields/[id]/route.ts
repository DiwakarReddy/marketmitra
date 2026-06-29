// /api/custom-fields/[id] - update or delete a single custom field

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const FIELD_TYPES = new Set(['text', 'number', 'date', 'select', 'boolean', 'multiselect'])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.customField.findUnique({ where: { id: params.id } })
  if (!existing || existing.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const updates: any = {}

  if (body.label !== undefined) updates.label = String(body.label).trim()
  if (body.type !== undefined) {
    if (!FIELD_TYPES.has(body.type)) {
      return NextResponse.json({ error: `Invalid type` }, { status: 400 })
    }
    updates.type = body.type
  }
  if (body.options !== undefined) {
    updates.options = Array.isArray(body.options) ? JSON.stringify(body.options) : null
  }
  if (body.required !== undefined) updates.required = !!body.required
  if (body.active !== undefined) updates.active = !!body.active
  if (typeof body.order === 'number') updates.order = body.order

  // Note: key is intentionally NOT updatable to keep stable references in templates
  const field = await prisma.customField.update({
    where: { id: params.id },
    data: updates,
  })
  return NextResponse.json({ ok: true, field })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.customField.findUnique({ where: { id: params.id } })
  if (!existing || existing.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.customField.delete({ where: { id: params.id } })
  await prisma.activity.create({
    data: {
      businessId, type: 'custom_field_deleted', actor: 'owner',
      title: `Custom field removed: ${existing.label}`,
      description: `${existing.label} and all its values have been removed`,
    },
  })
  return NextResponse.json({ ok: true })
}
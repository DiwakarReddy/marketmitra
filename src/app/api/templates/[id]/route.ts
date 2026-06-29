// /api/templates/[id]
//   GET    : full template detail
//   PATCH  : update template (any field)
//   DELETE : archive (soft delete — keeps audit trail)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, validateTemplate, extractTokens } from '@/lib/templates'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const row = await prisma.messageTemplate.findFirst({
    where: { id: params.id, businessId },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ template: dbToTemplate(row) })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.messageTemplate.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: any = {}
  const allowed = ['name', 'description', 'channel', 'category', 'body', 'metaTemplateName', 'smsBody', 'emailSubject', 'emailHtml', 'emailText', 'status']
  for (const k of allowed) {
    if (body[k] !== undefined) updates[k] = body[k]
  }
  if (body.metaTemplateConfig !== undefined) {
    updates.metaTemplateConfig = body.metaTemplateConfig ? JSON.stringify(body.metaTemplateConfig) : null
  }

  // Re-validate
  const merged = { ...existing, ...updates }
  const v = validateTemplate(merged as any)
  if (!v.valid) {
    return NextResponse.json({ error: 'Validation failed', details: v.errors }, { status: 400 })
  }

  // Re-derive variables
  const allText = [updates.body ?? existing.body, updates.smsBody ?? existing.smsBody, updates.emailSubject ?? existing.emailSubject, updates.emailHtml ?? existing.emailHtml].filter(Boolean).join('\n')
  updates.variables = JSON.stringify(extractTokens(allText))

  const updated = await prisma.messageTemplate.update({
    where: { id: existing.id },
    data: updates,
  })
  return NextResponse.json({ ok: true, template: dbToTemplate(updated) })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const existing = await prisma.messageTemplate.findFirst({
    where: { id: params.id, businessId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft delete (archive) — keep audit trail
  await prisma.messageTemplate.update({
    where: { id: existing.id },
    data: { status: 'archived' },
  })
  return NextResponse.json({ ok: true, archived: true })
}

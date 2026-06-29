// /api/templates/[id]/render
//   POST { customerId, appointmentId? }
//   Returns the rendered template (preview only — does NOT send)

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, renderTemplateForCustomer } from '@/lib/templates'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { customerId, appointmentId } = await req.json()
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  }
  const row = await prisma.messageTemplate.findFirst({
    where: { id: params.id, businessId },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const rendered = await renderTemplateForCustomer(dbToTemplate(row), customerId, appointmentId)
    return NextResponse.json({ ok: true, rendered })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Render failed' }, { status: 500 })
  }
}

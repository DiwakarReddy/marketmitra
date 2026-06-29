// /api/templates/bulk-render
//   POST { templateId, customerIds: string[], concurrency? }
//   Renders for many customers without sending. Use for previews, export, etc.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, bulkRenderTemplate } from '@/lib/templates'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const { templateId, customerIds, concurrency, skipUnresolved } = await req.json()
  if (!templateId || !Array.isArray(customerIds) || customerIds.length === 0) {
    return NextResponse.json({ error: 'templateId and customerIds[] required' }, { status: 400 })
  }
  if (customerIds.length > 10000) {
    return NextResponse.json({ error: 'Too many customers (max 10000 per call — use campaigns for bigger lists)' }, { status: 400 })
  }

  const row = await prisma.messageTemplate.findFirst({
    where: { id: templateId, businessId },
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await bulkRenderTemplate({
      template: dbToTemplate(row),
      customerIds,
      businessId,
      concurrency,
      skipUnresolved,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Bulk render failed' }, { status: 500 })
  }
}

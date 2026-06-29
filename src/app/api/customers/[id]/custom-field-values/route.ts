// GET /api/customers/[id]/custom-field-values
// Returns all custom field values for one customer, keyed by field.key.
// Useful for pre-populating the edit modal.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const customer = await prisma.customer.findUnique({ where: { id: params.id } })
  if (!customer || customer.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [values, fields] = await Promise.all([
    prisma.customerFieldValue.findMany({
      where: { customerId: params.id },
      include: { field: true },
    }),
    prisma.customField.findMany({
      where: { businessId, active: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const valuesByKey: Record<string, string> = {}
  for (const v of values) {
    valuesByKey[v.field.key] = v.value
  }

  return NextResponse.json({
    values: valuesByKey,
    fields: fields.map((f) => ({
      ...f,
      options: f.options ? JSON.parse(f.options) : null,
    })),
  })
}
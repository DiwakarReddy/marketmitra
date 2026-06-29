// /api/customers/custom-fields
//   POST: bulk upsert field values for one customer
//     Body: { customerId, values: { [fieldKey]: value, ... } }
//
// Field values are stored in CustomerFieldValue (one row per customer×field).
// Schema is denormalized for fast retrieval; field.key used as the lookup map.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const rl = applyRateLimit(req, businessId, 'customFieldUpdate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const customerId = body.customerId
  const values = body.values as Record<string, unknown>

  if (!customerId || typeof values !== 'object' || values === null) {
    return NextResponse.json({ error: 'customerId and values required' }, { status: 400 })
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer || customer.businessId !== businessId) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Look up all fields referenced by key
  const keys = Object.keys(values)
  const fields = await prisma.customField.findMany({
    where: { businessId, key: { in: keys } },
  })
  if (fields.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 })
  }

  // Validate values per type
  const errors: string[] = []
  for (const field of fields) {
    const raw = values[field.key]
    if (raw === null || raw === undefined || raw === '') continue
    const strVal = String(raw)
    switch (field.type) {
      case 'number':
        if (Number.isNaN(Number(strVal))) errors.push(`${field.label}: must be a number`)
        break
      case 'boolean':
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(strVal.toLowerCase())) {
          errors.push(`${field.label}: must be true/false`)
        }
        break
      case 'date':
        if (Number.isNaN(new Date(strVal).getTime())) errors.push(`${field.label}: must be a valid date`)
        break
      case 'select':
      case 'multiselect': {
        const opts = field.options ? (JSON.parse(field.options) as string[]) : []
        if (field.type === 'select') {
          if (!opts.includes(strVal)) errors.push(`${field.label}: must be one of [${opts.join(', ')}]`)
        } else {
          const items = strVal.split(',').map((s) => s.trim())
          const bad = items.filter((i) => !opts.includes(i))
          if (bad.length) errors.push(`${field.label}: invalid options [${bad.join(', ')}]`)
        }
        break
      }
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  // Upsert each value. Use a single transaction for atomicity.
  await prisma.$transaction(
    fields.map((field) => {
      const raw = values[field.key]
      const serialized = raw === null || raw === undefined || raw === '' ? '' : String(raw)
      return prisma.customerFieldValue.upsert({
        where: { customerId_fieldId: { customerId, fieldId: field.id } },
        create: { customerId, fieldId: field.id, value: serialized },
        update: { value: serialized },
      })
    })
  )

  return NextResponse.json({ ok: true, updated: fields.length })
}
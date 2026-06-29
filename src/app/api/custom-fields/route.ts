// Custom Fields API — per-business configurable fields on Customer records.
// Unlocks personalization in templates, broadcasts, drips, CTWA.
//
// Endpoints:
//   GET    /api/custom-fields              list fields
//   POST   /api/custom-fields              create field
//   PATCH  /api/custom-fields/[id]         update field
//   DELETE /api/custom-fields/[id]         delete field (cascades values)
//   GET    /api/customers/custom-fields    bulk-fetch values for current business
//   POST   /api/customers/custom-fields    bulk upsert values for one customer

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { applyRateLimit, RATE_LIMITS, rateLimitResponse } from '@/lib/rate-limit'

const FIELD_TYPES = new Set(['text', 'number', 'date', 'select', 'boolean', 'multiselect'])

function validateKey(key: string): string | null {
  if (!/^[a-z][a-z0-9_]{0,49}$/.test(key)) {
    return 'Key must start with a letter, contain only lowercase letters, numbers, and underscores (max 50 chars)'
  }
  return null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const fields = await prisma.customField.findMany({
    where: { businessId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json({ fields })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const actorEmail = session.user.email || undefined

  const rl = applyRateLimit(req, businessId, 'customFieldCreate')
  if (!rl?.allowed) return rateLimitResponse(rl!)

  const body = await req.json()
  const { key, label, type, options, required, order } = body

  if (!key || !label || !type) {
    return NextResponse.json({ error: 'key, label, type are required' }, { status: 400 })
  }
  const keyError = validateKey(key)
  if (keyError) return NextResponse.json({ error: keyError }, { status: 400 })
  if (!FIELD_TYPES.has(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${[...FIELD_TYPES].join(', ')}` }, { status: 400 })
  }
  if ((type === 'select' || type === 'multiselect') && (!Array.isArray(options) || options.length === 0)) {
    return NextResponse.json({ error: `${type} fields require at least one option` }, { status: 400 })
  }

  try {
    const field = await prisma.customField.create({
      data: {
        businessId,
        key,
        label,
        type,
        options: options ? JSON.stringify(options) : null,
        required: !!required,
        order: typeof order === 'number' ? order : 0,
      },
    })
    await prisma.activity.create({
      data: {
        businessId, type: 'custom_field_created', actor: 'owner',
        title: `Custom field created: ${label}`,
        description: `${label} (${type}) added to customer records`,
      },
    })
    return NextResponse.json({ ok: true, field })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: `A field with key "${key}" already exists` }, { status: 409 })
    }
    throw err
  }
}
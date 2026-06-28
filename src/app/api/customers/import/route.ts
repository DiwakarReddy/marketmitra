import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { parseCustomersCSV } from '@/lib/csv'

// POST /api/customers/import
// Body: { csv: string } OR { customers: ParsedCustomer[] }
// Returns: { imported, skipped, errors }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const contentType = req.headers.get('content-type') || ''

  let csvText = ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    csvText = await file.text()
  } else {
    const body = await req.json()
    csvText = body.csv || ''
  }

  if (!csvText) {
    return NextResponse.json({ error: 'No CSV content' }, { status: 400 })
  }

  const parsed = parseCustomersCSV(csvText)

  let imported = 0
  let skipped = 0
  const errors = [...parsed.errors]

  for (const c of parsed.customers) {
    try {
      await prisma.customer.upsert({
        where: { businessId_phone: { businessId, phone: c.phone } },
        update: {
          name: c.name,
          email: c.email,
          lastVisitAt: c.lastVisitAt,
          totalVisits: c.totalVisits,
          totalSpentPaise: c.totalSpentPaise,
          tags: c.tags ? JSON.stringify(c.tags) : null,
          notes: c.notes,
        },
        create: {
          businessId,
          phone: c.phone,
          name: c.name,
          email: c.email,
          lastVisitAt: c.lastVisitAt,
          totalVisits: c.totalVisits || 0,
          totalSpentPaise: c.totalSpentPaise || 0,
          tags: c.tags ? JSON.stringify(c.tags) : null,
          notes: c.notes,
        },
      })
      imported++
    } catch (err) {
      skipped++
      errors.push({ row: 0, error: `${c.phone}: ${err instanceof Error ? err.message : 'failed'}` })
    }
  }

  await prisma.activity.create({
    data: {
      businessId,
      type: 'customer_import',
      actor: 'owner',
      title: `Imported ${imported} customers from CSV`,
      description: skipped > 0 ? `${skipped} skipped` : undefined,
    },
  })

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    totalRows: parsed.totalRows,
    validRows: parsed.validRows,
    errors,
  })
}
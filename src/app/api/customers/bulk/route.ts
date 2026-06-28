import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/customers/bulk
// Bulk actions on multiple customers
// Body: { ids: string[], action: 'delete' | 'tag' | 'untag' | 'message', value?: string }

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const { ids, action, value } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids[] required' }, { status: 400 })
  }

  // Verify all customers belong to this business
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids }, businessId },
  })
  const validIds = customers.map((c) => c.id)

  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No valid customers' }, { status: 400 })
  }

  let count = 0

  if (action === 'delete') {
    const result = await prisma.customer.deleteMany({ where: { id: { in: validIds } } })
    count = result.count
  } else if (action === 'tag' && value) {
    // Add tag to each
    for (const customer of customers) {
      const current = customer.tags ? customer.tags.split(',').map((t) => t.trim()) : []
      if (!current.includes(value)) {
        current.push(value)
        await prisma.customer.update({
          where: { id: customer.id },
          data: { tags: current.join(',') },
        })
        count++
      }
    }
  } else if (action === 'untag' && value) {
    for (const customer of customers) {
      const current = customer.tags ? customer.tags.split(',').map((t) => t.trim()) : []
      if (current.includes(value)) {
        const next = current.filter((t) => t !== value)
        await prisma.customer.update({
          where: { id: customer.id },
          data: { tags: next.join(',') },
        })
        count++
      }
    }
  } else if (action === 'message') {
    // Send a message (using a draft campaign) - placeholder
    count = validIds.length
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  await prisma.activity.create({
    data: {
      businessId,
      type: 'bulk_customer_action',
      actor: 'owner',
      title: `Bulk ${action}`,
      description: `${count} customers affected`,
    },
  })

  return NextResponse.json({ ok: true, count })
}
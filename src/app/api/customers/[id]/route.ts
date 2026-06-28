import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// PATCH /api/customers/:id - Update customer
// DELETE /api/customers/:id - Delete customer

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const customer = await prisma.customer.findUnique({ where: { id: params.id } })
  if (!customer || customer.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const allowed = ['name', 'phone', 'email', 'language', 'tags', 'notes', 'optedOut', 'birthday', 'anniversary']
  const updates: any = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  if (updates.birthday) updates.birthday = new Date(updates.birthday)
  if (updates.anniversary) updates.anniversary = new Date(updates.anniversary)

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: updates,
  })

  return NextResponse.json({ ok: true, customer: updated })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const customer = await prisma.customer.findUnique({ where: { id: params.id } })
  if (!customer || customer.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.customer.delete({ where: { id: customer.id } })
  return NextResponse.json({ ok: true })
}
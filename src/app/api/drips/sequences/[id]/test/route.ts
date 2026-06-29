// /api/drips/sequences/[id]/test
//   POST { customerId: string, stepIndex?: number }
//   Renders the (or one) step for the customer and PREVIEWS it without
//   enrolling or sending. Useful for QA + "what does the customer see?"
//   before flipping a trigger on for real.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { dbToTemplate, renderTemplateForCustomer } from '@/lib/templates'
import { buildTemplateContext } from '@/lib/template-context'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const body = await req.json().catch(() => ({}))
  const { customerId, stepIndex } = body
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 })
  }

  const sequence = await prisma.dripSequence.findFirst({
    where: { id: params.id, businessId },
    include: { steps: { orderBy: { position: 'asc' } } },
  })
  if (!sequence) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    include: { customFieldValues: { include: { field: true } } },
  })
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const customFieldDefs = await prisma.customField.findMany({
    where: { businessId, active: true },
  })

  const ctx = buildTemplateContext({
    customer: { ...customer, customFieldValues: customer.customFieldValues || [] },
    business: {
      name: business.name,
      ownerName: business.ownerName,
      city: business.city,
      language: business.language,
      currency: business.currency,
    },
    customFieldDefs,
  })

  const idx = typeof stepIndex === 'number' ? stepIndex : 0
  const steps = sequence.steps
  const start = Math.max(0, Math.min(idx, steps.length - 1))
  const end = Math.min(start + 3, steps.length)
  const out: any[] = []

  for (let i = start; i < end; i++) {
    const step = steps[i]
    let rendered: any = { channel: step.channel }
    if (step.templateId) {
      const tpl = await prisma.messageTemplate.findUnique({ where: { id: step.templateId } })
      if (tpl) {
        const r = await renderTemplateForCustomer(dbToTemplate(tpl), customerId)
        rendered.body = r.body || r.smsBody || r.emailText
        rendered.subject = r.emailSubject
        rendered.html = r.emailHtml
        rendered.unresolved = r.unresolved
      }
    } else if (step.messageBody) {
      // Freeform — inline token substitution via fillTemplate-equivalent
      let body = step.messageBody
      for (const [k, v] of Object.entries(ctx)) {
        body = body.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), String(v))
      }
      rendered.body = body
    }
    out.push({ position: i, ...rendered })
  }

  return NextResponse.json({ ok: true, customer: { id: customer.id, name: customer.name }, preview: out })
}
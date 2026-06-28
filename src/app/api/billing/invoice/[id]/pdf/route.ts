import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { generateInvoicePDF } from '@/lib/pdf'

// GET /api/billing/invoice/[id]/pdf - Returns PDF for download

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const invoice = await prisma.invoice.findUnique({ where: { id: params.id } })

  if (!invoice || invoice.businessId !== businessId) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  try {
    const pdfBuffer = await generateInvoicePDF(params.id)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoice.id.slice(-8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('[PDF gen error]', err)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
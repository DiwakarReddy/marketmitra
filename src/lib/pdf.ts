// PDF invoice generation using pdfkit (lightweight, server-side)
// GST-compliant invoice format for India

import PDFDocument from 'pdfkit'
import { prisma } from '@/lib/db'

interface InvoiceLineItem {
  date: Date
  description: string
  quantity: number
  unitPricePaise: number
  totalPaise: number
}

interface InvoiceData {
  invoiceNumber: string
  invoiceDate: Date
  dueDate: Date
  business: {
    name: string
    address: string
    gstin?: string
    pan?: string
    email: string
    phone: string
    state: string
  }
  billTo: {
    name: string
    address: string
    email: string
    gstin?: string
    state: string
  }
  periodStart: Date
  periodEnd: Date
  lineItems: InvoiceLineItem[]
  subtotalPaise: number
  cgstRate: number // 0.09 for intra-state
  sgstRate: number
  igstRate: number // 0.18 for inter-state
  notes?: string
}

export async function generateInvoicePDF(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { business: true },
  })
  if (!invoice) throw new Error('Invoice not found')

  const perBookingPaise = invoice.business.perBookingPaise

  // Get the bookings that this invoice covers
  const bookings = await prisma.appointment.findMany({
    where: {
      businessId: invoice.businessId,
      createdAt: { gte: invoice.periodStart, lt: invoice.periodEnd },
      status: { in: ['booked', 'completed', 'visited'] },
    },
    include: { customer: true, service: true },
    orderBy: { createdAt: 'asc' },
  })

  const b = invoice.business
  const stateCode = getStateCode(b.state || '')

  const lineItems: InvoiceLineItem[] = bookings.map((apt) => ({
    date: apt.createdAt,
    description: `${apt.service?.name || 'Service'} for ${apt.customer.name}`,
    quantity: 1,
    unitPricePaise: perBookingPaise,
    totalPaise: perBookingPaise,
  }))

  const data: InvoiceData = {
    invoiceNumber: 'INV-' + invoice.id.slice(-8).toUpperCase(),
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 14 * 86400000),
    business: {
      name: 'MarketMitra Technologies Pvt Ltd',
      address: '123 Tech Park, Indore, Madhya Pradesh 452010',
      gstin: '23ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      email: 'billing@marketmitra.com',
      phone: '+91 98765 00000',
      state: 'Madhya Pradesh',
    },
    billTo: {
      name: b.name,
      address: `${b.city}${b.state ? ', ' + b.state : ''}, India`,
      email: b.ownerEmail,
      gstin: undefined,
      state: b.state || '',
    },
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    lineItems,
    subtotalPaise: invoice.amountPaise,
    cgstRate: 0.09,
    sgstRate: 0.09,
    igstRate: 0.18,
    notes: 'Per-booking fee for MarketMitra AI Marketing service. Thank you for your business.',
  }

  // Determine if inter-state (different states -> IGST, else CGST+SGST)
  const interState = b.state?.toLowerCase() !== 'madhya pradesh'
  const totalTaxPaise = interState
    ? Math.round(data.subtotalPaise * data.igstRate)
    : Math.round(data.subtotalPaise * (data.cgstRate + data.sgstRate))

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // === HEADER ===
    doc.fontSize(24).fillColor('#0f766e').text('TAX INVOICE', { align: 'right' })
    doc.fillColor('black').fontSize(10)
    doc.text(`Invoice #: ${data.invoiceNumber}`, { align: 'right' })
    doc.text(`Date: ${data.invoiceDate.toLocaleDateString('en-IN')}`, { align: 'right' })
    doc.text(`Due: ${data.dueDate.toLocaleDateString('en-IN')}`, { align: 'right' })

    doc.moveDown(2)

    // === FROM / TO ===
    const startY = doc.y
    doc.fontSize(11).fillColor('#64748b').text('FROM', 50, startY)
    doc.fontSize(10).fillColor('black').text(data.business.name, 50, startY + 15)
    doc.text(data.business.address)
    doc.text(`GSTIN: ${data.business.gstin}`)
    doc.text(`PAN: ${data.business.pan}`)
    doc.text(`Email: ${data.business.email}`)
    doc.text(`Phone: ${data.business.phone}`)

    doc.fontSize(11).fillColor('#64748b').text('BILL TO', 320, startY)
    doc.fontSize(10).fillColor('black').text(data.billTo.name, 320, startY + 15)
    doc.text(data.billTo.address, 320, startY + 30, { width: 230 })
    doc.text(`Email: ${data.billTo.email}`, 320)

    doc.moveDown(2)

    // === PERIOD ===
    doc.fontSize(11).fillColor('#64748b').text('Service Period:')
    doc.fillColor('black').text(`${data.periodStart.toLocaleDateString('en-IN')} to ${data.periodEnd.toLocaleDateString('en-IN')}`)

    doc.moveDown(1)

    // === LINE ITEMS TABLE ===
    const tableTop = doc.y
    const colX = { num: 50, date: 80, desc: 200, qty: 380, price: 430, total: 510 }

    doc.fontSize(10).fillColor('#0f766e')
    doc.text('#', colX.num, tableTop)
    doc.text('Date', colX.date, tableTop)
    doc.text('Description', colX.desc, tableTop)
    doc.text('Qty', colX.qty, tableTop)
    doc.text('Unit Price', colX.price, tableTop)
    doc.text('Total', colX.total, tableTop, { align: 'right', width: 50 })

    doc.moveTo(50, tableTop + 15).lineTo(560, tableTop + 15).strokeColor('#cbd5e1').stroke()

    doc.fillColor('black').fontSize(9)
    let rowY = tableTop + 20

    data.lineItems.forEach((item, i) => {
      if (rowY > 700) {
        doc.addPage()
        rowY = 50
      }
      doc.text(String(i + 1), colX.num, rowY)
      doc.text(item.date.toLocaleDateString('en-IN'), colX.date, rowY)
      doc.text(item.description, colX.desc, rowY, { width: 170, ellipsis: true })
      doc.text(String(item.quantity), colX.qty, rowY)
      doc.text(`₹${(item.unitPricePaise / 100).toFixed(2)}`, colX.price, rowY)
      doc.text(`₹${(item.totalPaise / 100).toFixed(2)}`, colX.total, rowY, { align: 'right', width: 50 })
      rowY += 18
    })

    doc.moveTo(50, rowY).lineTo(560, rowY).strokeColor('#cbd5e1').stroke()

    // === TOTALS ===
    rowY += 15
    const totalsX = 400

    doc.fontSize(10).fillColor('black')
    doc.text('Subtotal:', totalsX, rowY)
    doc.text(`₹${(data.subtotalPaise / 100).toFixed(2)}`, 510, rowY, { align: 'right', width: 50 })
    rowY += 18

    if (interState) {
      doc.text(`IGST @ ${(data.igstRate * 100).toFixed(0)}%:`, totalsX, rowY)
      doc.text(`₹${(data.subtotalPaise * data.igstRate / 100).toFixed(2)}`, 510, rowY, { align: 'right', width: 50 })
      rowY += 18
    } else {
      doc.text(`CGST @ ${(data.cgstRate * 100).toFixed(0)}%:`, totalsX, rowY)
      doc.text(`₹${(data.subtotalPaise * data.cgstRate / 100).toFixed(2)}`, 510, rowY, { align: 'right', width: 50 })
      rowY += 18
      doc.text(`SGST @ ${(data.sgstRate * 100).toFixed(0)}%:`, totalsX, rowY)
      doc.text(`₹${(data.subtotalPaise * data.sgstRate / 100).toFixed(2)}`, 510, rowY, { align: 'right', width: 50 })
      rowY += 18
    }

    doc.moveTo(totalsX, rowY).lineTo(560, rowY).strokeColor('#0f766e').stroke()

    rowY += 10
    doc.fontSize(13).fillColor('#0f766e')
    doc.text('TOTAL:', totalsX, rowY)
    const grandTotal = data.subtotalPaise + totalTaxPaise
    doc.text(`₹${(grandTotal / 100).toFixed(2)}`, 510, rowY, { align: 'right', width: 50 })

    // === NOTES ===
    rowY += 40
    if (data.notes) {
      doc.fontSize(9).fillColor('#64748b').text('Notes:', 50, rowY)
      doc.fillColor('black').text(data.notes, 50, rowY + 12, { width: 510 })
    }

    // === FOOTER ===
    doc.fontSize(8).fillColor('#94a3b8')
    doc.text('This is a computer-generated invoice. No signature required.', 50, 780, { align: 'center', width: 510 })
    doc.text(`MarketMitra • billing@marketmitra.com • Generated ${new Date().toISOString()}`, 50, 795, { align: 'center', width: 510 })

    doc.end()
  })
}

// Indian state code lookup for GST
const STATE_CODES: Record<string, string> = {
  'andhra pradesh': '37',
  'arunachal pradesh': '12',
  'assam': '18',
  'bihar': '10',
  'chhattisgarh': '22',
  'goa': '30',
  'gujarat': '24',
  'haryana': '06',
  'himachal pradesh': '02',
  'jharkhand': '20',
  'karnataka': '29',
  'kerala': '32',
  'madhya pradesh': '23',
  'maharashtra': '27',
  'manipur': '14',
  'meghalaya': '17',
  'mizoram': '15',
  'nagaland': '13',
  'odisha': '21',
  'punjab': '03',
  'rajasthan': '08',
  'sikkim': '11',
  'tamil nadu': '33',
  'telangana': '36',
  'tripura': '16',
  'uttar pradesh': '09',
  'uttarakhand': '05',
  'west bengal': '19',
  'delhi': '07',
}

function getStateCode(state: string): string {
  return STATE_CODES[state.toLowerCase()] || ''
}
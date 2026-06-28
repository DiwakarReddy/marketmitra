// /api/me/business-tax — PATCH GST/PAN/legal name for the current business
// Stored on the Business model. Editable in Settings → Billing Details.

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z[A-Z\d]{1}$/
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]{1}$/
const STATE_CODE_RE = /^\d{2}$/

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      legalName: true,
      gstin: true,
      pan: true,
      hsnSac: true,
      stateCode: true,
      taxScheme: true,
      billingAddress: true,
      billingCity: true,
      billingState: true,
      billingPincode: true,
      name: true,
      city: true,
      state: true,
    },
  })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  return NextResponse.json({ tax: business })
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId
  const body = await req.json().catch(() => ({}))

  const data: any = {}

  if (body.legalName !== undefined) {
    if (typeof body.legalName !== 'string' || body.legalName.trim().length < 2 || body.legalName.length > 200) {
      return NextResponse.json({ error: 'Legal name must be 2-200 characters' }, { status: 400 })
    }
    data.legalName = body.legalName.trim()
  }

  if (body.gstin !== undefined) {
    if (body.gstin === '' || body.gstin === null) {
      data.gstin = null
    } else {
      const v = String(body.gstin).trim().toUpperCase()
      if (!GSTIN_RE.test(v)) {
        return NextResponse.json({ error: 'Invalid GSTIN format. Expected: 22AAAAA0000A1Z5 (15 chars)' }, { status: 400 })
      }
      data.gstin = v
      // Auto-derive state code (first 2 digits)
      data.stateCode = v.substring(0, 2)
      // Auto-derive PAN (chars 3-12 of GSTIN)
      if (!body.pan) data.pan = v.substring(2, 12)
    }
  }

  if (body.pan !== undefined && !data.pan) {
    if (body.pan === '' || body.pan === null) {
      data.pan = null
    } else {
      const v = String(body.pan).trim().toUpperCase()
      if (!PAN_RE.test(v)) {
        return NextResponse.json({ error: 'Invalid PAN format. Expected: AAAAA0000A (10 chars)' }, { status: 400 })
      }
      data.pan = v
    }
  }

  if (body.hsnSac !== undefined) {
    if (body.hsnSac === '' || body.hsnSac === null) {
      data.hsnSac = null
    } else {
      const v = String(body.hsnSac).trim()
      if (!/^\d{4,8}$/.test(v)) {
        return NextResponse.json({ error: 'Invalid HSN/SAC code (4-8 digits)' }, { status: 400 })
      }
      data.hsnSac = v
    }
  }

  if (body.stateCode !== undefined && !data.stateCode) {
    if (body.stateCode === '' || body.stateCode === null) {
      data.stateCode = null
    } else {
      const v = String(body.stateCode).trim()
      if (!STATE_CODE_RE.test(v)) {
        return NextResponse.json({ error: 'State code must be 2 digits (e.g. 23 for MP, 27 for MH)' }, { status: 400 })
      }
      data.stateCode = v
    }
  }

  if (body.taxScheme !== undefined) {
    const allowed = ['regular', 'composition', 'exempt']
    if (body.taxScheme && !allowed.includes(body.taxScheme)) {
      return NextResponse.json({ error: 'taxScheme must be one of: ' + allowed.join(', ') }, { status: 400 })
    }
    data.taxScheme = body.taxScheme || null
  }

  if (body.billingAddress !== undefined) data.billingAddress = body.billingAddress?.trim() || null
  if (body.billingCity !== undefined) data.billingCity = body.billingCity?.trim() || null
  if (body.billingState !== undefined) data.billingState = body.billingState?.trim() || null
  if (body.billingPincode !== undefined) {
    if (body.billingPincode && !/^\d{6}$/.test(String(body.billingPincode).trim())) {
      return NextResponse.json({ error: 'Pincode must be 6 digits' }, { status: 400 })
    }
    data.billingPincode = body.billingPincode?.trim() || null
  }

  const updated = await prisma.business.update({
    where: { id: businessId },
    data,
    select: {
      legalName: true,
      gstin: true,
      pan: true,
      hsnSac: true,
      stateCode: true,
      taxScheme: true,
      billingAddress: true,
      billingCity: true,
      billingState: true,
      billingPincode: true,
    },
  })

  return NextResponse.json({ ok: true, tax: updated })
}
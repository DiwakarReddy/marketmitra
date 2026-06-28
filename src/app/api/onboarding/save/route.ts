import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/onboarding/save
// Persists all onboarding steps to the business record

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  const data = await req.json()
  const {
    vertical,
    businessName,
    ownerName,
    city,
    state,
    language,
    knowledge,
    whatsappConnected,
    whatsappPhone,
    instagramConnected,
    instagramHandle,
    googleAdsConnected,
    voiceConnected,
    services,
  } = data

  // Update business
  await prisma.business.update({
    where: { id: businessId },
    data: {
      vertical: vertical || undefined,
      name: businessName || undefined,
      ownerName: ownerName || undefined,
      city: city || undefined,
      state: state || undefined,
      language: language || 'hinglish',
      knowledge: knowledge || undefined,
      whatsappConnected: whatsappConnected || false,
      whatsappPhone: whatsappPhone || undefined,
      instagramConnected: instagramConnected || false,
      voiceConnected: voiceConnected || false,
      googleAdsConnected: googleAdsConnected || false,
      onboardedAt: new Date(),
    },
  })

  // Replace services if provided
  if (Array.isArray(services) && services.length > 0) {
    await prisma.service.deleteMany({ where: { businessId } })
    await prisma.service.createMany({
      data: services
        .filter((s: any) => s.name)
        .map((s: any) => ({
          businessId,
          name: s.name,
          durationMin: parseInt(s.duration) || 30,
          pricePaise: parseRupees(s.price),
          description: s.description,
        })),
    })
  }

  await prisma.activity.create({
    data: {
      businessId,
      type: 'onboarding_completed',
      actor: 'owner',
      title: 'Onboarding completed',
      description: `Vertical: ${vertical}, language: ${language}`,
    },
  })

  return NextResponse.json({ ok: true, businessId })
}

function parseRupees(raw: any): number {
  if (!raw) return 0
  const cleaned = String(raw).replace(/[^\d.]/g, '')
  const num = parseFloat(cleaned)
  if (isNaN(num)) return 0
  return Math.round(num * 100)
}
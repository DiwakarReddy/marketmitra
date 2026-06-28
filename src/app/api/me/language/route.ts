// POST /api/me/language - Save user's UI language preference
// Persists to business record so AI also knows to reply in this language

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { SUPPORTED_LANGUAGES, type UILanguage } from '@/lib/i18n'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const lang = body?.language

  if (!lang || !SUPPORTED_LANGUAGES.some((l) => l.code === lang)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  await prisma.business.update({
    where: { id: (session as any).businessId },
    data: { language: lang },
  })

  return NextResponse.json({ ok: true, language: lang })
}
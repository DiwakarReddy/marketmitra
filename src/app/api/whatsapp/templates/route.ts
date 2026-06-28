// /api/whatsapp/templates — List approved WhatsApp templates from Meta
// Cached for 5 minutes per business (in-memory). Falls back to built-in templates
// when Meta is not configured (so the UI always has something to show).

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveChannel } from '@/lib/channel-resolver'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { fetchedAt: number; templates: any[] }>()

// Built-in fallback templates (used when WhatsApp is not configured OR Meta API fails).
// These mirror what Meta approval usually looks like for an India dental business.
const FALLBACK_TEMPLATES = [
  {
    id: 'reactivation_v1',
    name: 'reactivation_v1',
    category: 'MARKETING',
    language: 'hi',
    status: 'APPROVED',
    body: 'नमस्ते {{1}} जी! 🙏 आप {{2}} से हमारे पास आए थे {{3}} के लिए। {{4}} महीने हो गए — एक visit plan करें! Special {{5}}% off. Book: {{6}}',
    variables: ['name', 'last_visit_date', 'service', 'months_since', 'discount_pct', 'booking_link'],
    source: 'fallback',
  },
  {
    id: 'birthday_wish',
    name: 'birthday_wish',
    category: 'MARKETING',
    language: 'hi',
    status: 'APPROVED',
    body: '🎂 Happy Birthday {{1}}! {{businessName}} की ओर से {{2}}% off आपके अगले visit पर। जन्मदिन मुबारक हो! 🎉',
    variables: ['name', 'discount_pct'],
    source: 'fallback',
  },
  {
    id: 'review_request',
    name: 'review_request',
    category: 'MARKETING',
    language: 'hi',
    status: 'APPROVED',
    body: '{{1}} जी, {{2}} के लिए धन्यवाद! 🙏 आपका 2 मिनट का review हमारे लिए बहुत मायने रखता है: {{3}}',
    variables: ['name', 'service', 'review_link'],
    source: 'fallback',
  },
  {
    id: 'booking_confirmation',
    name: 'booking_confirmation',
    category: 'UTILITY',
    language: 'hi',
    status: 'APPROVED',
    body: '✓ {{1}} जी, आपकी appointment confirm है!\n\n📅 {{2}} at {{3}}\n👤 {{4}}\n📞 {{5}}\n🦷 {{6}}\n\nकुछ बदलना हो तो reply करें।',
    variables: ['name', 'date', 'time', 'name_again', 'phone', 'service'],
    source: 'fallback',
  },
  {
    id: 'appointment_reminder',
    name: 'appointment_reminder',
    category: 'UTILITY',
    language: 'hi',
    status: 'APPROVED',
    body: '🔔 Reminder: {{1}} जी, कल {{2}} पर आपका appointment है ({{3}}).\n\n✅ Confirm: "YES"\n🔄 Reschedule: "RESCHEDULE"\n❌ Cancel: "CANCEL"',
    variables: ['name', 'datetime', 'service'],
    source: 'fallback',
  },
  {
    id: 'festival_offer',
    name: 'festival_offer',
    category: 'MARKETING',
    language: 'hi',
    status: 'APPROVED',
    body: '🪔 {{1}} की हार्दिक शुभकामनाएं!\n\n{{businessName}} की ओर से {{3}}% की विशेष छूट — सीमित समय के लिए।\n\nBook: {{4}}',
    variables: ['festival_name', 'business_name', 'discount_pct', 'booking_link'],
    source: 'fallback',
  },
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const businessId = (session as any).businessId

  // Cache hit?
  const cached = cache.get(businessId)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ templates: cached.templates, source: 'cache' })
  }

  // Try Meta
  let templates: any[] = []
  let source: 'meta' | 'fallback' | 'mixed' = 'fallback'

  try {
    const channel = await resolveChannel(businessId, 'whatsapp')
    if (channel && channel.provider === 'meta' && channel.credentials?.accessToken && channel.config?.businessAccountId) {
      const accessToken = channel.credentials.accessToken
      const wabaId = channel.config.businessAccountId
      const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0'
      const url = `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,category,language,status,components&limit=250`

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        templates = (data.data || [])
          .filter((t: any) => t.status === 'APPROVED')
          .map((t: any) => {
            const bodyComp = (t.components || []).find((c: any) => c.type === 'BODY')
            const variables = extractVariables(bodyComp?.text || '')
            return {
              id: t.id || t.name,
              name: t.name,
              category: t.category,
              language: t.language,
              status: t.status,
              body: bodyComp?.text || '',
              variables,
              source: 'meta',
            }
          })
        source = 'meta'
      }
    }
  } catch (err) {
    console.warn('[WhatsApp templates] Meta fetch failed:', err instanceof Error ? err.message : err)
  }

  // If Meta returned nothing, use fallback
  if (templates.length === 0) {
    templates = FALLBACK_TEMPLATES
    source = 'fallback'
  }

  cache.set(businessId, { fetchedAt: Date.now(), templates })
  return NextResponse.json({ templates, source })
}

function extractVariables(text: string): string[] {
  // Match {{1}}, {{2}}, etc.
  const matches = text.match(/\{\{(\d+)\}\}/g) || []
  const nums = matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10))
  const max = nums.length ? Math.max(...nums) : 0
  return Array.from({ length: max }, (_, i) => `var_${i + 1}`)
}

export async function POST(req: Request) {
  // Force refresh by clearing cache
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  cache.delete((session as any).businessId)
  return GET()
}
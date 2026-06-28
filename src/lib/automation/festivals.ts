// Feature #4: Festival campaigns
// Cron checks daily for upcoming festivals (3 days lead time)
// AI generates business-specific offer + sends WhatsApp to all active customers

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateWithCustomPrompt } from '@/lib/ai'
import fs from 'fs'
import path from 'path'

// Load festival calendar (refreshed on each run)
let festivalCache: any[] | null = null
function loadFestivals() {
  if (festivalCache) return festivalCache
  try {
    const p = path.join(process.cwd(), 'prisma', 'festivals.json')
    const raw = fs.readFileSync(p, 'utf-8')
    festivalCache = JSON.parse(raw)
    return festivalCache
  } catch {
    return []
  }
}

export async function runFestivalCampaigns() {
  const businesses = await prisma.business.findMany({
    where: {
      festivalCampaignsEnabled: true,
      plan: { not: 'suspended' },
    },
  })

  const today = new Date()
  const festivals = loadFestivals()
  let sent = 0

  for (const business of businesses) {
    // Find festivals within leadDays window
    const upcoming = (festivals || []).filter((f) => {
      const festDate = new Date(f.date)
      const daysUntil = Math.floor((festDate.getTime() - today.getTime()) / 86400000)
      return daysUntil > 0 && daysUntil <= (f.leadDays || 3)
    })

    for (const festival of upcoming) {
      // Check if we already sent this campaign
      const alreadySent = await prisma.automationEvent.findFirst({
        where: {
          businessId: business.id,
          type: 'festival_offer',
          metadata: { contains: festival.name },
          sentAt: { gte: new Date(today.getTime() - 7 * 86400000) },
        },
      })
      if (alreadySent) continue

      // Get customers (active, not opted out)
      const customers = await prisma.customer.findMany({
        where: { businessId: business.id, optedOut: false },
        take: 500,
      })

      if (customers.length === 0) continue

      // AI generates festival-specific offer for this business
      const offerMessage = await generateWithCustomPrompt(`You are a marketing expert for ${business.name}, a ${business.vertical} in ${business.city || 'India'}. Write a Hinglish WhatsApp message for ${festival.name} (${festival.hindiName || ''}, ${festival.description}). Greet customers warmly, offer a special 15% discount, create urgency (festival is in 3 days), include booking link. Max 4 sentences. No excessive emojis.`, `Generate festival campaign. ${customers.length} customers. ${festival.name} is in 3 days.`)

      const defaultMessage = `${festival.hindiName || festival.name} की शुभकामनाएं! 🎉\n\n${business.name} की ओर से ${festival.name} पर विशेष 15% छूट — 3 दिनों के लिए।\n\nBook करें: ${process.env.APP_URL || 'https://marketmitra.in'}/widget`

      const finalMessage = offerMessage || defaultMessage

      for (const customer of customers) {
        const personalized = finalMessage.replace('${name}', customer.name.split(' ')[0])
        const result = await sendWhatsAppMessage({
          to: customer.phone,
          message: personalized,
        }, { businessId: business.id })

        await prisma.automationEvent.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            type: 'festival_offer',
            status: result.success ? 'sent' : 'failed',
            channel: 'whatsapp',
            message: personalized,
            error: result.success ? null : (result as any).error,
            metadata: JSON.stringify({ festival: festival.name, date: festival.date }),
          },
        })

        if (result.success) sent++
      }

      // Log the campaign
      await prisma.activity.create({
        data: {
          businessId: business.id,
          type: 'festival_campaign',
          actor: 'ai',
          title: `${festival.name} campaign sent`,
          description: `Sent to ${customers.length} customers`,
        },
      })
    }
  }

  return { sent }
}
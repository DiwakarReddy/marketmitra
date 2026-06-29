import cron from 'node-cron'
import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { getReactivationMessage } from '@/lib/prompts'
import { processRetryQueue } from '@/lib/retry'
import { runDunningCheck } from '@/lib/dunning'
import { runReviewRequestCheck } from '@/lib/automation/reviews'
import { runBirthdayWishes } from '@/lib/automation/birthdays'
import { runFestivalCampaigns } from '@/lib/automation/festivals'
import { scoreUpcomingAppointments, sendConfirmationRequests, autoCancelNoShows } from '@/lib/automation/noshow'
import { runKeyRotationCheck } from '@/lib/automation/key-rotation'
import { runDripWorker } from '@/lib/drips'

let cronStarted = false

/**
 * In-flight job tracker — prevents the same job from running on
 * multiple instances / multiple ticks (e.g. when the cron tick is
 * invoked both by the in-process worker and Vercel Cron).
 */
const inFlight = new Set<string>()
function tryClaim(key: string): boolean {
  if (inFlight.has(key)) return false
  inFlight.add(key)
  // Auto-release after 5 minutes — safety net if a worker crashes.
  setTimeout(() => inFlight.delete(key), 5 * 60 * 1000).unref()
  return true
}

// Start the cron worker. Safe to call multiple times — only starts once.
export function startCronWorker() {
  if (cronStarted) return
  cronStarted = true

  // Every minute: check for scheduled campaigns + due daily summaries
  cron.schedule('* * * * *', async () => {
    try {
      await runScheduledJobs()
    } catch (err) {
      console.error('[cron] error:', err)
    }
  })

  console.log('[cron] worker started — running every minute')
}

export async function runScheduledJobs() {
  // Each task is wrapped in a "claim" — if the same task is already
  // running on another instance, we skip it. This makes the cron
  // safe to run from multiple sources (in-process worker + Vercel
  // Cron + manual click).
  if (tryClaim('scheduled-campaigns')) await runScheduledCampaigns()
  if (tryClaim('daily-summaries')) await runDailySummaries()
  if (tryClaim('retry-queue')) await processRetryQueue()
  if (tryClaim('review-requests')) await runReviewRequestCheck()
  if (tryClaim('no-show-score')) await scoreUpcomingAppointments()
  if (tryClaim('confirmations')) await sendConfirmationRequests()
  if (tryClaim('no-show-cancel')) await autoCancelNoShows()
  if (tryClaim('drip-worker')) await runDripWorker(100)
}

// Runs at 9 AM daily
export async function runDailyJobs() {
  await runDunningCheck()
  await runBirthdayWishes()
  await runFestivalCampaigns()
  await runKeyRotationCheck()
}

async function runScheduledCampaigns() {
  const now = new Date()

  // Find campaigns that are scheduled and due
  const due = await prisma.campaign.findMany({
    where: {
      status: 'scheduled',
      scheduledFor: { lte: now },
    },
    select: { id: true, businessId: true, audience: true, channels: true, messageBody: true, name: true },
  })

  for (const campaign of due) {
    try {
      // Use the same multi-channel worker that /api/campaigns uses.
      // Supports templateId via the Campaign row (currently null on the
      // legacy Campaign model — see note in [id]/send route).
      const { runCampaignSend, resolveAudience } = await import('@/app/api/campaigns/route')
      const audienceIds = await resolveAudience(campaign.businessId, campaign.audience || 'all')
      if (audienceIds.length === 0) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'completed', endedAt: new Date(), leads: 0 },
        })
        continue
      }
      // Don't await — let cron tick stay fast
      runCampaignSend(
        campaign.id,
        campaign.businessId,
        null, // templateId — to be added as a column later
        audienceIds,
        campaign.messageBody || undefined
      ).catch((err) => console.error(`[cron] campaign ${campaign.id} failed:`, err))
    } catch (err) {
      console.error(`[cron] campaign ${campaign.id} failed:`, err)
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'failed' },
      })
    }
  }
}

export async function executeCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { business: { include: { customers: true, services: true } } },
  })
  if (!campaign) return { sent: 0 }

  const business = campaign.business
  // campaign.channels is stored as a comma-separated string OR a JSON array
  // (depending on the code path that created it). Normalize to a string[].
  let channels: string[] = []
  try {
    const raw = campaign.channels
    if (!raw) channels = ['whatsapp']
    else if (raw.trim().startsWith('[')) channels = JSON.parse(raw)
    else channels = raw.split(',').map((c) => c.trim()).filter(Boolean)
  } catch {
    channels = ['whatsapp']
  }
  // audience: stored as plain string ("all", "vip", "inactive", "new", "tag:foo")
  // OR a JSON object — handle both. The new send API uses a plain string.
  let audience: any = {}
  if (campaign.audience) {
    try {
      if (campaign.audience.trim().startsWith('{')) {
        audience = JSON.parse(campaign.audience)
      } else {
        audience = { preset: campaign.audience }
      }
    } catch {
      audience = { preset: campaign.audience }
    }
  }

  // Determine target audience
  let targets = business.customers.filter((c) => !c.optedOut)
  if (audience.inactiveSinceDays) {
    const cutoff = new Date(Date.now() - audience.inactiveSinceDays * 86400000)
    targets = targets.filter((c) => c.lastVisitAt && c.lastVisitAt < cutoff)
  }
  if (audience.tags && Array.isArray(audience.tags)) {
    targets = targets.filter((c) => {
      const tags = c.tags ? JSON.parse(c.tags) : []
      return audience.tags.some((t: string) => tags.includes(t))
    })
  }

  let sent = 0
  const errors: string[] = []

  // WhatsApp channel
  if (channels.includes('whatsapp') || channels.includes('all')) {
    for (const customer of targets) {
      const personalized = (campaign.messageBody || getReactivationMessage(
        business.vertical,
        business.language,
        {
          name: customer.name,
          businessName: business.name,
          ownerName: business.ownerName,
          lastVisit: customer.lastVisitAt
            ? new Date(customer.lastVisitAt).toLocaleDateString('en-IN')
            : 'a while ago',
        }
      )).replaceAll('{{name}}', customer.name)

      const result = await sendWhatsAppMessage({
        to: customer.phone,
        message: personalized,
      }, { businessId: business.id })
      if (result.success) sent++
      else errors.push(`${customer.phone}: ${result.error}`)
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'running', startedAt: new Date() },
  })

  await prisma.activity.create({
    data: {
      businessId: campaign.businessId,
      type: 'campaign_launched',
      actor: 'ai',
      title: `Campaign launched: ${campaign.name}`,
      description: `Sent to ${sent} customers${errors.length ? `, ${errors.length} failed` : ''}`,
    },
  })

  return { sent, errors: errors.length, total: targets.length }
}

async function runDailySummaries() {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()

  // Send daily summary at 8:00 PM (20:00) ± 1 minute window
  if (hour !== 20 || minute > 1) return

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const businesses = await prisma.business.findMany({
    where: {
      onboardedAt: { not: null },
      whatsappPhone: { not: null },
    },
    select: { id: true, name: true, language: true, ownerPhone: true, ownerName: true, city: true, perBookingPaise: true, currency: true, vertical: true },
  })

  for (const business of businesses) {
    try {
      // Check if we already sent today
      const alreadySent = await prisma.activity.findFirst({
        where: {
          businessId: business.id,
          type: 'daily_summary',
          createdAt: { gte: today },
        },
      })
      if (alreadySent) continue

      const summary = await buildDailySummary(business.id, today)
      const messageText = formatSummaryForWhatsApp(summary, business)

      // Send to owner's WhatsApp
      await sendWhatsAppMessage({
        to: business.ownerPhone,
        message: messageText,
      }, { businessId: business.id })

      await prisma.activity.create({
        data: {
          businessId: business.id,
          type: 'daily_summary',
          actor: 'ai',
          title: 'Daily summary sent',
          description: messageText.substring(0, 200),
        },
      })
    } catch (err) {
      console.error(`[cron] daily summary for ${business.id} failed:`, err)
    }
  }
}

async function buildDailySummary(businessId: string, today: Date) {
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const [leads, bookings, conversations, aiReplies, upcomingAppointments] = await Promise.all([
    prisma.lead.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.conversation.count({ where: { businessId, lastMessageAt: { gte: today, lt: tomorrow } } }),
    prisma.message.count({ where: { conversation: { businessId }, sender: 'ai', createdAt: { gte: today, lt: tomorrow } } }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startsAt: { gte: tomorrow, lt: new Date(tomorrow.getTime() + 86400000) },
        status: { in: ['booked', 'confirmed'] },
      },
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
  ])

  const revenue = await prisma.lead.aggregate({
    where: {
      businessId,
      status: 'paid',
      lastTouchAt: { gte: today, lt: tomorrow },
    },
    _sum: { valuePaise: true },
  })

  return { leads, bookings, conversations, aiReplies, upcomingAppointments, revenuePaise: revenue._sum.valuePaise || 0 }
}

function formatSummaryForWhatsApp(summary: any, business: any): string {
  const lang = business.language || 'hinglish'
  const isHinglish = lang === 'hinglish' || lang === 'hindi'

  const greeting = isHinglish ? `🙏 नमस्ते ${business.ownerName.split(' ')[0]} जी!` : `Hi ${business.ownerName}!`
  const intro = isHinglish ? 'आज की MarketMitra रिपोर्ट:' : "Today's MarketMitra report:"

  const lines = [
    greeting,
    `${intro}`,
    ``,
    `📊 *आज के नंबर:*`,
    `• नए लीड्स: ${summary.leads}`,
    `• नई बुकिंग: ${summary.bookings}`,
    `• WhatsApp बातचीत: ${summary.conversations}`,
    `• AI ने जवाब दिए: ${summary.aiReplies}`,
    `• आज की कमाई: ₹${(summary.revenuePaise / 100).toFixed(0)}`,
    ``,
  ]

  if (summary.upcomingAppointments.length > 0) {
    lines.push(`📅 *कल की appointments:*`)
    for (const apt of summary.upcomingAppointments) {
      const time = new Date(apt.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
      lines.push(`• ${time} - ${apt.customer.name} (${apt.service?.name || 'consultation'})`)
    }
    lines.push('')
  }

  lines.push(`AI सब handle कर रहा है। आप बस customers को देखिए! 🚀`)

  return lines.join('\n')
}
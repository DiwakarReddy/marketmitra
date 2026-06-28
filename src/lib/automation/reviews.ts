// Feature #1: Post-visit Google review request
// Sends WhatsApp 2 hours after appointment completion with Google review link
// Per business, customer won't get asked twice in 30 days

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateWithCustomPrompt } from '@/lib/ai'

const REVIEW_REQUEST_DELAY_HOURS = 2
const COOLDOWN_DAYS = 30 // Don't ask same customer twice in 30 days

export async function runReviewRequestCheck() {
  const businesses = await prisma.business.findMany({
    where: {
      googleReviewUrl: { not: null },
      plan: { not: 'suspended' },
    },
  })

  let sent = 0
  for (const business of businesses) {
    const delayMs = (business.reviewRequestDelayHours || REVIEW_REQUEST_DELAY_HOURS) * 60 * 60 * 1000
    const cutoff = new Date(Date.now() - delayMs)

    // Find completed appointments in the delay window that haven't been asked
    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: 'completed',
        reviewRequestSent: false,
        updatedAt: { lte: cutoff, gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { customer: true, service: true },
      take: 50,
    })

    for (const appt of appointments) {
      // Cooldown: don't ask if asked within last 30 days
      if (
        appt.customer.lastReviewRequestAt &&
        Date.now() - appt.customer.lastReviewRequestAt.getTime() < COOLDOWN_DAYS * 86400000
      ) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reviewRequestSent: true }, // mark as handled (we'll skip)
        })
        continue
      }

      const firstName = appt.customer.name.split(' ')[0]
      const serviceName = appt.service?.name || 'visit'

      // Generate AI-personalized review request
      const aiMessage = await generateWithCustomPrompt(`You are a friendly business manager for ${business.name} (${business.vertical}). Write a warm, casual message in Hinglish asking a customer for a Google review. Keep it short (max 2 sentences), include their first name, mention the service they got. End with the review link. Don't use emojis excessively.`, `Customer ${firstName} just got "${serviceName}". Write a review request for ${business.googleReviewUrl}`)

      const message = aiMessage || `${firstName} जी, ${serviceName} के लिए धन्यवाद! 🙏 आपका 2 मिनट का review हमारे लिए बहुत मायने रखता है। यहाँ click करें: ${business.googleReviewUrl}`

      const result = await sendWhatsAppMessage({
        to: appt.customer.phone,
        message,
      }, { businessId: business.id })

      await prisma.automationEvent.create({
        data: {
          businessId: business.id,
          customerId: appt.customer.id,
          appointmentId: appt.id,
          type: 'review_request',
          status: result.success ? 'sent' : 'failed',
          channel: 'whatsapp',
          message,
          error: result.success ? null : (result as any).error,
        },
      })

      if (result.success) {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { reviewRequestSent: true },
        })
        await prisma.customer.update({
          where: { id: appt.customer.id },
          data: { lastReviewRequestAt: new Date() },
        })
        sent++
      }
    }
  }
  return { sent }
}
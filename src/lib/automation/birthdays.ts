// Feature #2: Birthday & anniversary auto-wishes
// Cron runs daily at 9 AM, sends personalized WhatsApp wish with special offer

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateWithCustomPrompt } from '@/lib/ai'

export async function runBirthdayWishes() {
  const businesses = await prisma.business.findMany({
    where: {
      birthdayWishesEnabled: true,
      plan: { not: 'suspended' },
    },
  })

  const today = new Date()
  const month = today.getMonth() + 1
  const day = today.getDate()

  let sent = 0
  for (const business of businesses) {
    // Find customers with birthday today (and not wished this year)
    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        optedOut: false,
        birthday: { not: null },
      },
    })

    const birthdayCustomers = customers.filter((c) => {
      if (!c.birthday) return false
      const bday = new Date(c.birthday)
      const isBirthday = bday.getMonth() + 1 === month && bday.getDate() === day
      const notWished = !c.lastBirthdayWishedAt ||
        new Date(c.lastBirthdayWishedAt).getFullYear() < today.getFullYear()
      return isBirthday && notWished
    })

    for (const customer of birthdayCustomers) {
      await sendWish(business, customer, 'birthday', business.wishOfferPercent || 10)
      sent++
    }

    // Anniversary wishes
    const anniversaryCustomers = customers.filter((c) => {
      if (!c.anniversary) return false
      const anniv = new Date(c.anniversary)
      const isAnniv = anniv.getMonth() + 1 === month && anniv.getDate() === day
      const notWished = !c.lastAnniversaryWishedAt ||
        new Date(c.lastAnniversaryWishedAt).getFullYear() < today.getFullYear()
      return isAnniv && notWished
    })

    for (const customer of anniversaryCustomers) {
      await sendWish(business, customer, 'anniversary', business.wishOfferPercent || 10)
      sent++
    }
  }
  return { sent }
}

async function sendWish(
  business: any,
  customer: any,
  type: 'birthday' | 'anniversary',
  offerPercent: number
) {
  const firstName = customer.name.split(' ')[0]
  const occasion = type === 'birthday' ? 'जन्मदिन' : 'वैवाहिक वर्षगांठ'

  // AI-generated personalized message
  const aiMessage = await generateWithCustomPrompt(`You are the owner of ${business.name}, a ${business.vertical} business in ${business.city || 'India'}. Write a warm Hinglish ${type} wish for a customer. Keep it under 3 sentences, include their first name, and offer them ${offerPercent}% off their next visit. End with booking link. Don't overdo emojis.`, `Customer ${firstName}, it's their ${type}. ${offerPercent}% off offer. Write wish.`)

  const defaultMessage = `${firstName} जी, आपकी ${occasion} की हार्दिक शुभकामनाएं! 🎂 ${business.name} की ओर से ${offerPercent}% की विशेष छूट अगले visit पर। Book: ${process.env.APP_URL || 'https://marketmitra.in'}/widget`

  const message = aiMessage || defaultMessage

  const result = await sendWhatsAppMessage({
    to: customer.phone,
    message,
  }, { businessId: business.id })

  await prisma.automationEvent.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      type: type === 'birthday' ? 'birthday_wish' : 'anniversary_wish',
      status: result.success ? 'sent' : 'failed',
      channel: 'whatsapp',
      message,
      error: result.success ? null : (result as any).error,
    },
  })

  if (result.success) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        [type === 'birthday' ? 'lastBirthdayWishedAt' : 'lastAnniversaryWishedAt']: new Date(),
      },
    })
  }
}
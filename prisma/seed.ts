import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clear existing data
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.appointment.deleteMany()
  await prisma.lead.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.approval.deleteMany()
  await prisma.service.deleteMany()
  await prisma.businessHour.deleteMany()
  await prisma.invoice.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.business.deleteMany()

  // Create demo business
  const business = await prisma.business.create({
    data: {
      name: 'SmileCare Dental Clinic',
      vertical: 'dental',
      ownerName: 'Dr. Priya Sharma',
      ownerEmail: 'priya@smilecare.demo',
      ownerPhone: '+919876543210',
      city: 'Indore',
      state: 'Madhya Pradesh',
      language: 'hinglish',
      currency: 'INR',
      plan: 'growth',
      monthlyPricePaise: 0,
      perBookingPaise: 20000,
      onboardedAt: new Date(),
      whatsappConnected: true,
      whatsappPhone: '+919876543210',
      instagramConnected: true,
      googleAdsConnected: true,
      knowledge: 'We specialize in painless root canals and kids dentistry. We accept all major insurance. Free first consultation for kids under 12.',
    },
  })

  const passwordHash = await bcrypt.hash('demo1234', 10)
  await prisma.user.create({
    data: {
      businessId: business.id,
      email: 'priya@smilecare.demo',
      name: 'Dr. Priya Sharma',
      role: 'owner',
      passwordHash,
    },
  })

  // Services
  const services = await Promise.all([
    prisma.service.create({ data: { businessId: business.id, name: 'Dental Consultation', description: 'Initial checkup', durationMin: 30, pricePaise: 50000 } }),
    prisma.service.create({ data: { businessId: business.id, name: 'Teeth Cleaning', description: 'Scaling & polishing', durationMin: 45, pricePaise: 150000 } }),
    prisma.service.create({ data: { businessId: business.id, name: 'Root Canal', description: 'Single sitting RCT', durationMin: 90, pricePaise: 800000 } }),
    prisma.service.create({ data: { businessId: business.id, name: 'Kids Checkup', description: 'Pediatric dental', durationMin: 30, pricePaise: 30000 } }),
    prisma.service.create({ data: { businessId: business.id, name: 'Tooth Extraction', description: 'Simple extraction', durationMin: 30, pricePaise: 100000 } }),
  ])

  // Business hours (Mon-Sat 9-8, Sun 10-2)
  for (let day = 0; day < 7; day++) {
    await prisma.businessHour.create({
      data: {
        businessId: business.id,
        dayOfWeek: day,
        openTime: day === 0 ? '10:00' : '09:00',
        closeTime: day === 0 ? '14:00' : '20:00',
        closed: false,
      },
    })
  }

  // Customers
  const customers = await Promise.all([
    prisma.customer.create({ data: { businessId: business.id, name: 'रिया शर्मा', phone: '+919876501001', lastVisitAt: new Date(Date.now() - 95 * 86400000), totalVisits: 3 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'अमित पटेल', phone: '+919876501002', lastVisitAt: new Date(Date.now() - 30 * 86400000), totalVisits: 5 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'सुनीता जोशी', phone: '+919876501003', lastVisitAt: new Date(Date.now() - 180 * 86400000), totalVisits: 2 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'राहुल वर्मा', phone: '+919876501004', lastVisitAt: new Date(Date.now() - 14 * 86400000), totalVisits: 1 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'प्रिया वर्मा', phone: '+919876501005', lastVisitAt: new Date(Date.now() - 60 * 86400000), totalVisits: 4 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'मोहित जैन', phone: '+919876501006', lastVisitAt: new Date(Date.now() - 7 * 86400000), totalVisits: 2 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'दीपक कुमार', phone: '+919876501007', lastVisitAt: new Date(Date.now() - 200 * 86400000), totalVisits: 1 } }),
    prisma.customer.create({ data: { businessId: business.id, name: 'अंजलि सिंह', phone: '+919876501008', lastVisitAt: new Date(Date.now() - 45 * 86400000), totalVisits: 3 } }),
  ])

  // Conversations + messages
  const riya = customers[0]
  const conv1 = await prisma.conversation.create({
    data: {
      businessId: business.id,
      customerId: riya.id,
      channel: 'whatsapp',
      status: 'ai_handling',
      lastMessageAt: new Date(Date.now() - 2 * 60000),
    },
  })

  await prisma.message.createMany({
    data: [
      { conversationId: conv1.id, direction: 'inbound', sender: 'customer', content: 'Hi, mujhe appointment chahiye Sunday ko', createdAt: new Date(Date.now() - 5 * 60000) },
      { conversationId: conv1.id, direction: 'outbound', sender: 'ai', content: 'नमस्ते रिया जी! 🙏 Sunday 28 June को ये slots available हैं: 10 AM, 2 PM, 4:30 PM. Kaunsa time suit karega?', createdAt: new Date(Date.now() - 4 * 60000) },
      { conversationId: conv1.id, direction: 'inbound', sender: 'customer', content: '2 PM theek hai', createdAt: new Date(Date.now() - 3 * 60000) },
      { conversationId: conv1.id, direction: 'outbound', sender: 'ai', content: 'Perfect! ✓ 28 June, 2:00 PM book kar diya hai. Aapka naam aur phone number confirm karein?', createdAt: new Date(Date.now() - 2 * 60000) },
    ],
  })

  // Campaigns
  await prisma.campaign.create({
    data: {
      businessId: business.id,
      name: 'मानसून ऑफर — Monsoon Dental Care',
      type: 'broadcast',
      channels: JSON.stringify(['whatsapp', 'instagram', 'google']),
      status: 'running',
      audience: JSON.stringify({ inactiveSinceDays: 60 }),
      budgetPaise: 1500000,
      spentPaise: 45000,
      leads: 18,
      bookings: 6,
      startedAt: new Date(Date.now() - 12 * 86400000),
    },
  })

  await prisma.campaign.create({
    data: {
      businessId: business.id,
      name: '90-day reactivation',
      type: 'reactivation',
      channels: JSON.stringify(['whatsapp', 'voice']),
      status: 'running',
      audience: JSON.stringify({ inactiveSinceDays: 90 }),
      budgetPaise: 20000,
      spentPaise: 12000,
      leads: 32,
      bookings: 8,
      startedAt: new Date(Date.now() - 20 * 86400000),
    },
  })

  // Approvals
  await prisma.approval.create({
    data: {
      businessId: business.id,
      type: 'whatsapp_broadcast',
      title: 'Monsoon dental care — 7-day series',
      preview: 'नमस्ते! 🙏 SmileCare Dental। बारिश के मौसम में दाँतों की देखभाल ज़रूरी है। इस हफ्ते हम लाए हैं 7 दिन की free tips। Day 1 tip कल सुबह आएगी! 🦷',
      recipients: 380,
      status: 'pending',
    },
  })

  await prisma.approval.create({
    data: {
      businessId: business.id,
      type: 'instagram_post',
      title: '5 monsoon foods that stain your teeth',
      preview: 'Reel • 30 sec video',
      recipients: 0,
      status: 'pending',
    },
  })

  await prisma.approval.create({
    data: {
      businessId: business.id,
      type: 'google_ad',
      title: 'New headline: "Open Sundays in Indore"',
      preview: 'Search ad variant test',
      recipients: 0,
      status: 'pending',
    },
  })

  // Appointments
  await prisma.appointment.create({
    data: {
      businessId: business.id,
      customerId: customers[0].id,
      serviceId: services[1].id,
      startsAt: new Date(Date.now() + 3 * 86400000 + 14 * 3600000),
      endsAt: new Date(Date.now() + 3 * 86400000 + 14 * 3600000 + 45 * 60000),
      status: 'booked',
      source: 'ai',
    },
  })

  // Recent activity
  await prisma.activity.createMany({
    data: [
      { businessId: business.id, type: 'ai_reply', actor: 'ai', title: 'AI replied to रिया शर्मा', description: 'Booked Sunday 2 PM slot', createdAt: new Date(Date.now() - 2 * 60000) },
      { businessId: business.id, type: 'voice_call', actor: 'ai', title: 'Voice AI: 25 reactivation calls', description: '4 bookings confirmed, ₹6,200 revenue', createdAt: new Date(Date.now() - 15 * 60000) },
      { businessId: business.id, type: 'instagram_post', actor: 'ai', title: 'Instagram Reel posted', description: '"मानसून में दाँतों की 5 देखभाल" — 1.2K reach', createdAt: new Date(Date.now() - 60 * 60000) },
      { businessId: business.id, type: 'google_ad', actor: 'ai', title: 'New Google Ad variant live', description: '"Open Sundays" headline — CTR 8.2%', createdAt: new Date(Date.now() - 2 * 3600000) },
      { businessId: business.id, type: 'broadcast_sent', actor: 'ai', title: 'WhatsApp broadcast sent', description: '380 past patients — weekend cleaning offer', createdAt: new Date(Date.now() - 3 * 3600000) },
    ],
  })

  // Leads
  for (let i = 0; i < 24; i++) {
    const sources = ['whatsapp_broadcast', 'instagram_reel', 'google_ad', 'voice_call', 'referral']
    const statuses = ['new', 'contacted', 'booked', 'visited', 'paid']
    await prisma.lead.create({
      data: {
        businessId: business.id,
        customerId: customers[i % customers.length].id,
        source: sources[i % sources.length],
        status: statuses[i % statuses.length],
        valuePaise: (Math.floor(Math.random() * 50) + 5) * 10000,
        firstTouchAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
      },
    })
  }

  console.log('✓ Database seeded with demo data')
  console.log(`  Business: ${business.name} (${business.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
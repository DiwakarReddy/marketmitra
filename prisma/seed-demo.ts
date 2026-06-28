// Production demo seed - 3 dental clinics with realistic Indian data
// Run: DATABASE_URL=... npx tsx prisma/seed-demo.ts
//
// Demo accounts (after seeding, all password: demo1234):
//   1. SmileCare Dental Indore (Starter plan, Hinglish)
//      priya@smilecare.demo
//   2. Smile Dental Mumbai (Growth plan, Hindi)
//      rahul@smiledental.demo
//   3. Pearl Smile Clinic Bangalore (Scale plan, English)
//      anjali@pearlsmile.demo

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async function main() {
  console.log('🌱 Seeding demo data...')

  // Wipe ALL demo-related rows (TRUNCATE CASCADE ignores FK constraints).
  // Tables list MUST match the current Prisma schema — do not add models that
  // don't exist (e.g. KnowledgeDoc, WidgetConfig, Integration were removed in v14).
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Account", "Session", "Business", "User", "Service", "BusinessHour", "Customer", "Conversation", "Message", "Campaign", "Approval", "Appointment", "Lead", "VoiceCall", "Activity", "Invoice", "FailedMessage", "AutomationEvent", "Festival", "TeamInvite", "ChannelConfig", "ChannelConfigAudit" RESTART IDENTITY CASCADE`)

  // Wipe festivals too (they have no businessId)
  await prisma.festival.deleteMany({})

  console.log('  → wiped existing data')

  // ============ DEMO 1: SmileCare Dental Indore (Hinglish, Starter) ============
  const smilecare = await prisma.business.create({
    data: {
      name: 'SmileCare Dental Clinic',
      ownerName: 'Priya Sharma',
      ownerEmail: 'priya@smilecare.demo',
      ownerPhone: '+919876543210',
      vertical: 'dental',
      city: 'Indore',
      state: 'Madhya Pradesh',
      language: 'hinglish',
      plan: 'starter',
      onboardedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      googleReviewUrl: 'https://g.page/r/smilecare-indore',
      businessSince: new Date('2010-04-15'),
      knowledge: JSON.stringify({
        about: 'SmileCare has been serving Indore families for 15 years. We specialize in painless root canals and pediatric dentistry.',
        specialties: ['Root Canal Treatment', 'Dental Implants', 'Pediatric Dentistry', 'Teeth Whitening', 'Braces & Aligners'],
        insurance: ['Star Health', 'HDFC ERGO', 'ICICI Lombard'],
        parking: 'Free parking available at the back of the clinic',
        paymentMethods: ['Cash', 'UPI', 'Cards', 'EMI via Bajaj Finserv'],
      }),
      birthdayWishesEnabled: true,
      festivalCampaignsEnabled: true,
      confirmationsEnabled: true,
    },
  })

  // User account for SmileCare
  await prisma.user.create({
    data: {
      email: 'priya@smilecare.demo',
      name: 'Priya Sharma',
      passwordHash: await hashPassword('demo1234'),
      businessId: smilecare.id,
      role: 'owner',
    },
  })

  // Customers for SmileCare
  const smilecareCustomers = await Promise.all([
    prisma.customer.create({
      data: {
        businessId: smilecare.id, phone: '919876543210', name: 'Rajesh Patel',
        language: 'hinglish', tags: JSON.stringify(['VIP', 'implant']),
        totalVisits: 4, totalSpentPaise: 3200000,
        birthday: new Date('1985-03-15'), anniversary: new Date('2010-11-22'),
      },
    }),
    prisma.customer.create({
      data: {
        businessId: smilecare.id, phone: '919876543211', name: 'Anita Deshmukh',
        language: 'hi', tags: JSON.stringify(['regular']),
        totalVisits: 8, totalSpentPaise: 1200000,
        birthday: new Date('1992-07-22'),
      },
    }),
    prisma.customer.create({
      data: {
        businessId: smilecare.id, phone: '919876543212', name: 'Mohammed Irfan',
        language: 'hinglish', tags: JSON.stringify(['braces']),
        totalVisits: 12, totalSpentPaise: 4500000,
        birthday: new Date('1988-11-08'),
      },
    }),
    prisma.customer.create({
      data: {
        businessId: smilecare.id, phone: '919876543213', name: 'Priya Nair',
        language: 'en', tags: JSON.stringify(['whitening']),
        totalVisits: 2, totalSpentPaise: 450000,
        birthday: new Date('1995-05-30'),
      },
    }),
  ])

  const now = Date.now()
  const past = (daysAgo: number) => new Date(now - daysAgo * 86400000)
  const future = (daysFromNow: number, hour = 14) => {
    const d = new Date(now + daysFromNow * 86400000)
    d.setHours(hour, 0, 0, 0)
    return d
  }

  // Create services
  const services = await Promise.all([
    prisma.service.create({ data: { businessId: smilecare.id, name: 'Dental Implant Consultation', active: true } }),
    prisma.service.create({ data: { businessId: smilecare.id, name: 'Root Canal', active: true } }),
    prisma.service.create({ data: { businessId: smilecare.id, name: 'Braces Adjustment', active: true } }),
    prisma.service.create({ data: { businessId: smilecare.id, name: 'Teeth Whitening', active: true } }),
  ])

  await prisma.appointment.createMany({
    data: [
      { businessId: smilecare.id, customerId: smilecareCustomers[0].id, serviceId: services[0].id, startsAt: past(180), endsAt: past(180), status: 'completed' },
      { businessId: smilecare.id, customerId: smilecareCustomers[1].id, serviceId: services[1].id, startsAt: past(45), endsAt: past(45), status: 'completed' },
      { businessId: smilecare.id, customerId: smilecareCustomers[2].id, serviceId: services[2].id, startsAt: past(30), endsAt: past(30), status: 'completed' },
      { businessId: smilecare.id, customerId: smilecareCustomers[3].id, serviceId: services[3].id, startsAt: future(0, 11), endsAt: future(0, 12), status: 'booked' },
      { businessId: smilecare.id, customerId: smilecareCustomers[0].id, serviceId: services[0].id, startsAt: future(3, 15), endsAt: future(3, 15), status: 'booked' },
    ],
  })

  // ============ DEMO 2: Smile Dental Mumbai (Hindi, Growth) ============
  const smileMumbai = await prisma.business.create({
    data: {
      name: 'Smile Dental & Implant Centre',
      ownerName: 'Dr. Rahul Mehta',
      ownerEmail: 'rahul@smiledental.demo',
      ownerPhone: '+919987650000',
      vertical: 'dental',
      city: 'Mumbai',
      state: 'Maharashtra',
      language: 'hi',
      plan: 'growth',
      onboardedAt: new Date(Date.now() - 90 * 86400000),
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      googleReviewUrl: 'https://g.page/r/smile-dental-mumbai',
      businessSince: new Date('2015-08-01'),
      wishOfferPercent: 15,
    },
  })

  await prisma.user.create({
    data: {
      email: 'rahul@smiledental.demo',
      name: 'Dr. Rahul Mehta',
      passwordHash: await hashPassword('demo1234'),
      businessId: smileMumbai.id,
      role: 'owner',
    },
  })

  const mumbaiCustomers = await Promise.all([
    prisma.customer.create({
      data: { businessId: smileMumbai.id, phone: '919987650001', name: 'Sanjay Joshi', language: 'hi', totalVisits: 3, totalSpentPaise: 850000, tags: JSON.stringify(['implant']) },
    }),
    prisma.customer.create({
      data: { businessId: smileMumbai.id, phone: '919987650002', name: 'Kavita Iyer', language: 'hi', totalVisits: 6, totalSpentPaise: 2400000, tags: JSON.stringify(['VIP', 'family']) },
    }),
  ])

  // ============ DEMO 3: Pearl Smile Clinic Bangalore (English, Scale) ============
  const pearl = await prisma.business.create({
    data: {
      name: 'Pearl Smile Multi-Speciality Dental',
      ownerName: 'Dr. Anjali Reddy',
      ownerEmail: 'anjali@pearlsmile.demo',
      ownerPhone: '+919900088877',
      vertical: 'dental',
      city: 'Bangalore',
      state: 'Karnataka',
      language: 'en',
      plan: 'scale',
      onboardedAt: new Date(Date.now() - 180 * 86400000),
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      googleReviewUrl: 'https://g.page/r/pearl-smile-bangalore',
      businessSince: new Date('2012-01-20'),
    },
  })

  await prisma.user.create({
    data: {
      email: 'anjali@pearlsmile.demo',
      name: 'Dr. Anjali Reddy',
      passwordHash: await hashPassword('demo1234'),
      businessId: pearl.id,
      role: 'owner',
    },
  })

  console.log('✓ Demo businesses created')
  console.log('')
  console.log('Demo accounts (all password: demo1234):')
  console.log(`  1. ${smilecare.name} (Hinglish, Starter)`)
  console.log(`     priya@smilecare.demo`)
  console.log(`  2. ${smileMumbai.name} (Hindi, Growth)`)
  console.log(`     rahul@smiledental.demo`)
  console.log(`  3. ${pearl.name} (English, Scale)`)
  console.log(`     anjali@pearlsmile.demo`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
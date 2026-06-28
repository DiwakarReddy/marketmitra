// Failed payment recovery (dunning)
// Handles Razorpay webhook events for payment failures
// Auto-retries failed payments + alerts business owner

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendEmail, dailySummaryEmail } from '@/lib/email'

interface DunningConfig {
  businessId: string
  invoiceId: string
  amountPaise: number
  attempt: number
  failureReason: string
  customerEmail: string
  customerPhone: string
  customerName: string
  businessName: string
}

const RETRY_SCHEDULE = [
  { days: 1, label: 'Gentle reminder' },
  { days: 3, label: 'Second reminder' },
  { days: 7, label: 'Final notice' },
  { days: 14, label: 'Service pause warning' },
  { days: 30, label: 'Account suspended' },
]

export async function processFailedPayment(config: DunningConfig) {
  const { businessId, invoiceId, attempt, failureReason } = config

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return

  // Log the failure
  await prisma.activity.create({
    data: {
      businessId,
      type: 'payment_failed',
      actor: 'system',
      title: `Payment failed (attempt ${attempt})`,
      description: `Invoice ${invoiceId.slice(-8)}: ₹${(config.amountPaise / 100).toFixed(0)}. Reason: ${failureReason}`,
    },
  })

  // Send dunning message to customer via WhatsApp
  const customerMessage = getDunningMessage(config, attempt)
  await sendWhatsAppMessage({
    to: config.customerPhone,
    message: customerMessage,
  }, { businessId: businessId })

  // Send email too (different channel)
  await sendEmail({
    to: config.customerEmail,
    subject: `Payment failed — ${config.businessName} (₹${(config.amountPaise / 100).toFixed(0)})`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0f172a;">Payment Failed</h2>
        <p>Hi ${config.customerName},</p>
        <p>We tried to charge your card for MarketMitra this month but the payment didn't go through.</p>
        <p><strong>Amount:</strong> ₹${(config.amountPaise / 100).toFixed(0)}<br/><strong>Reason:</strong> ${failureReason}</p>
        <p>This usually happens when:</p>
        <ul>
          <li>Your card expired</li>
          <li>Insufficient balance</li>
          <li>Bank declined the transaction</li>
        </ul>
        <p>Please update your payment method to keep your AI marketer running.</p>
        <a href="${process.env.APP_URL}/billing" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Update payment method →</a>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">If you have any questions, just reply to this email.</p>
      </div>
    `,
  })

  // Pause AI after 14 days of failure
  if (attempt >= 4) {
    await prisma.business.update({
      where: { id: businessId },
      data: { plan: 'starter_paused' }, // signal to cron to skip scheduled campaigns
    })
    await prisma.activity.create({
      data: {
        businessId,
        type: 'service_paused',
        actor: 'system',
        title: '⚠️ Service paused — payment overdue',
        description: 'AI campaigns paused. Update payment to resume.',
      },
    })
  }

  // Suspend after 30 days
  if (attempt >= 5) {
    await prisma.business.update({
      where: { id: businessId },
      data: { plan: 'suspended' },
    })
    await prisma.activity.create({
      data: {
        businessId,
        type: 'account_suspended',
        actor: 'system',
        title: '🚫 Account suspended',
        description: 'No payment for 30+ days. Contact support to restore.',
      },
    })
  }
}

function getDunningMessage(config: DunningConfig, attempt: number): string {
  const rupees = (config.amountPaise / 100).toFixed(0)
  const name = config.customerName.split(' ')[0]

  if (attempt === 1) {
    return `${name} जी, 🙏 MarketMitra का ₹${rupees} का payment auto-debit नहीं हो पाया (${config.failureReason}). कृपया card details update करें ताकि AI marketer चलता रहे। Link: ${process.env.APP_URL}/billing`
  }

  if (attempt === 2) {
    return `${name} जी, याद दिला रहे हैं — ₹${rupees} का payment अभी तक नहीं मिला। ${config.businessName} का AI marketer जारी रखने के लिए payment method update करें: ${process.env.APP_URL}/billing 🙏`
  }

  if (attempt === 3) {
    return `⚠️ ${name} जी, यह final notice है। ₹${rupees} का payment 7 दिन से pending है। अगर 7 दिन में payment नहीं मिला तो ${config.businessName} का AI service pause हो जाएगा। अभी update करें: ${process.env.APP_URL}/billing`
  }

  if (attempt === 4) {
    return `🚨 ${name} जी, ₹${rupees} unpaid है। ${config.businessName} का AI marketer आज से pause कर दिया गया है। Payment करते ही 5 मिनट में resume हो जाएगा: ${process.env.APP_URL}/billing`
  }

  return `${name} जी, ₹${rupees} 30+ दिन से unpaid है। Account suspend हो गया है। Restore करने के लिए support@marketmitra.com पर संपर्क करें।`
}

// Cron job — runs daily at 9 AM, checks for failed payments and sends dunning
export async function runDunningCheck() {
  const businesses = await prisma.business.findMany({
    where: { plan: { not: 'suspended' } },
  })

  let processed = 0

  for (const business of businesses) {
    // Find recent failed invoices
    const failedInvoices = await prisma.invoice.findMany({
      where: {
        businessId: business.id,
        status: 'failed',
        paidAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    for (const invoice of failedInvoices) {
      const daysSinceIssue = Math.floor((Date.now() - invoice.createdAt.getTime()) / 86400000)
      const expectedAttempt = RETRY_SCHEDULE.findIndex((s) => s.days >= daysSinceIssue) + 1

      if (expectedAttempt > 0) {
        const lastDunning = await prisma.activity.findFirst({
          where: { businessId: business.id, type: 'payment_failed' },
          orderBy: { createdAt: 'desc' },
        })

        const lastAttempt = lastDunning
          ? Math.floor((Date.now() - lastDunning.createdAt.getTime()) / 86400000)
          : 999

        if (lastAttempt >= 1) {
          // Send next dunning message
          await processFailedPayment({
            businessId: business.id,
            invoiceId: invoice.id,
            amountPaise: invoice.amountPaise,
            attempt: expectedAttempt,
            failureReason: 'Card declined (auto-retry)',
            customerEmail: business.ownerEmail,
            customerPhone: business.ownerPhone,
            customerName: business.ownerName,
            businessName: business.name,
          })
          processed++
        }
      }
    }
  }

  return { processed }
}
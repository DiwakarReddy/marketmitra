import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// Reliable message sending with retry + dead-letter queue
// All outbound messages go through this. Failed sends are saved and retried.

interface SendOptions {
  businessId: string
  customerId?: string
  phone: string
  message: string
  type?: 'text' | 'template'
  templateName?: string
  templateParams?: string[]
  maxAttempts?: number
}

const RETRY_DELAYS_MS = [
  60_000,        // 1 minute
  5 * 60_000,    // 5 minutes
  30 * 60_000,   // 30 minutes
  2 * 60 * 60_000, // 2 hours
  24 * 60 * 60_000, // 24 hours
]

export async function reliableSend(options: SendOptions): Promise<{ success: boolean; messageId?: string; queued: boolean; failedMessageId?: string; error?: string }> {
  const result = await sendWhatsAppMessage({
    to: options.phone,
    message: options.message,
    type: options.type,
    templateName: options.templateName,
    templateParams: options.templateParams,
  }, { businessId: options.businessId })

  if (result.success) {
    return { success: true, messageId: result.messageId, queued: false }
  }

  // Failed — queue for retry
  const failed = await prisma.failedMessage.create({
    data: {
      businessId: options.businessId,
      customerId: options.customerId,
      phone: options.phone,
      message: options.message,
      type: options.type || 'text',
      provider: result.provider || 'unknown',
      error: result.error || 'Unknown error',
      attempts: 1,
      status: 'pending',
      nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[0]),
    },
  })

  // Alert owner about first failure
  await prisma.activity.create({
    data: {
      businessId: options.businessId,
      type: 'message_failed',
      actor: 'ai',
      title: `WhatsApp send failed: ${options.phone}`,
      description: `${result.error}. Queued for auto-retry.`,
    },
  })

  return { success: false, queued: true, failedMessageId: failed.id, error: result.error }
}

// Called by cron every minute
export async function processRetryQueue() {
  const now = new Date()
  const due = await prisma.failedMessage.findMany({
    where: {
      status: 'pending',
      nextAttemptAt: { lte: now },
      attempts: { lt: 6 },
    },
    take: 50,
    orderBy: { nextAttemptAt: 'asc' },
  })

  let resolved = 0
  let failed = 0

  for (const msg of due) {
    try {
      const result = await sendWhatsAppMessage({
        to: msg.phone,
        message: msg.message,
        type: msg.type as 'text' | 'template',
      }, { businessId: msg.businessId })

      if (result.success) {
        await prisma.failedMessage.update({
          where: { id: msg.id },
          data: { status: 'sent', resolvedAt: new Date(), attempts: { increment: 1 }, lastAttemptAt: new Date() },
        })
        await prisma.activity.create({
          data: {
            businessId: msg.businessId,
            type: 'message_retried_success',
            actor: 'ai',
            title: `Retry succeeded after ${msg.attempts + 1} attempts`,
            description: `To: ${msg.phone}`,
          },
        })
        resolved++
      } else {
        const nextAttempt = msg.attempts + 1
        if (nextAttempt >= 6) {
          // Dead-letter
          await prisma.failedMessage.update({
            where: { id: msg.id },
            data: {
              status: 'dead',
              attempts: { increment: 1 },
              lastAttemptAt: new Date(),
              error: result.error || msg.error,
            },
          })
          await prisma.activity.create({
            data: {
              businessId: msg.businessId,
              type: 'message_dead_letter',
              actor: 'ai',
              title: `⚠️ Message permanently failed after ${nextAttempt} attempts`,
              description: `To: ${msg.phone}. Error: ${result.error}. Please contact customer manually.`,
            },
          })
        } else {
          await prisma.failedMessage.update({
            where: { id: msg.id },
            data: {
              attempts: { increment: 1 },
              lastAttemptAt: new Date(),
              error: result.error || msg.error,
              nextAttemptAt: new Date(Date.now() + (RETRY_DELAYS_MS[nextAttempt - 1] || 24 * 60 * 60_000)),
            },
          })
        }
        failed++
      }
    } catch (err) {
      failed++
    }
  }

  return { processed: due.length, resolved, failed }
}

// Get stats for dashboard
export async function getFailureStats(businessId?: string) {
  const where = businessId ? { businessId } : {}
  const [pending, dead, totalAttempts] = await Promise.all([
    prisma.failedMessage.count({ where: { ...where, status: 'pending' } }),
    prisma.failedMessage.count({ where: { ...where, status: 'dead' } }),
    prisma.failedMessage.aggregate({ where, _sum: { attempts: true } }),
  ])

  return { pending, dead, totalAttempts: totalAttempts._sum.attempts || 0 }
}
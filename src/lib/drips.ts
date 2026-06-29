// Drip Sequence engine — enrolls customers, schedules step executions,
// sends via WhatsApp (templates for outbound, free-form within 24h service window).
//
// Trigger types:
//   - 'manual'                : enroll() called explicitly
//   - 'new_customer'          : enroll() called when customer is created
//   - 'appointment_completed' : enroll() called when appointment status → completed
//   - 'lead_captured'         : enroll() called when lead is created
//   - 'tag_added'             : enroll() called when a tag is added to customer
//
// Step execution model:
//   - On enrollment, set enrollment.nextRunAt = now + steps[0].delayHours
//   - Worker (cron) finds enrollments where nextRunAt <= now, sends step, advances
//   - If customer replies to ANY inbound message, stop the drip (replied = stopReason)
//   - If customer.optedOut, mark all active enrollments stopped

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { buildTemplateContext, extractTemplatePlaceholders } from '@/lib/template-context'
import { fillTemplate } from '@/lib/template-engine'

export const DRIP_TRIGGERS = [
  'manual',
  'new_customer',
  'appointment_completed',
  'lead_captured',
  'tag_added',
] as const

export type DripTrigger = typeof DRIP_TRIGGERS[number]

/**
 * Enroll a customer in a sequence. Idempotent — won't double-enroll.
 * Returns enrollment record or null if skipped (already enrolled, drip not active, etc.)
 */
export async function enrollCustomer(
  sequenceId: string,
  customerId: string,
  opts: { skipActiveCheck?: boolean } = {}
): Promise<{ enrolled: boolean; enrollmentId?: string; reason?: string }> {
  const sequence = await prisma.dripSequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { position: 'asc' } } },
  })
  if (!sequence) return { enrolled: false, reason: 'sequence_not_found' }
  if (sequence.status !== 'active' && !opts.skipActiveCheck) {
    return { enrolled: false, reason: 'sequence_inactive' }
  }
  if (sequence.steps.length === 0) {
    return { enrolled: false, reason: 'no_steps' }
  }

  // Check customer
  const customer = await prisma.customer.findUnique({ where: { id: customerId } })
  if (!customer || customer.businessId !== sequence.businessId) {
    return { enrolled: false, reason: 'customer_not_found' }
  }
  if (customer.optedOut) return { enrolled: false, reason: 'customer_opted_out' }

  // Idempotency: skip if already enrolled
  const existing = await prisma.dripEnrollment.findUnique({
    where: { sequenceId_customerId: { sequenceId, customerId } },
  })
  if (existing && existing.status === 'active') {
    return { enrolled: false, reason: 'already_enrolled', enrollmentId: existing.id }
  }

  const firstStep = sequence.steps[0]
  const nextRunAt = new Date(Date.now() + firstStep.delayHours * 3600 * 1000)

  let enrollment
  if (existing) {
    // Re-enroll a previous (stopped/completed/failed) enrollment
    enrollment = await prisma.dripEnrollment.update({
      where: { id: existing.id },
      data: {
        status: 'active',
        currentStep: 0,
        nextRunAt,
        enrolledAt: new Date(),
        completedAt: null,
        lastStepAt: null,
        stopReason: null,
      },
    })
  } else {
    enrollment = await prisma.dripEnrollment.create({
      data: {
        sequenceId,
        customerId,
        businessId: sequence.businessId,
        nextRunAt,
      },
    })
  }

  await prisma.activity.create({
    data: {
      businessId: sequence.businessId,
      type: 'drip_enrolled',
      actor: 'system',
      title: `Enrolled in drip: ${sequence.name}`,
      description: `Customer ${customer.name} enrolled. First message scheduled for ${nextRunAt.toLocaleString('en-IN')}.`,
    },
  })

  return { enrolled: true, enrollmentId: enrollment.id }
}

/**
 * Stop a customer's enrollment in a sequence.
 */
export async function stopEnrollment(
  enrollmentId: string,
  reason: 'opted_out' | 'replied' | 'manual' | 'failed'
): Promise<void> {
  await prisma.dripEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'stopped', stopReason: reason, completedAt: new Date() },
  })
}

/**
 * Stop all active enrollments for a customer — called when they reply or opt out.
 */
export async function stopAllEnrollments(
  customerId: string,
  reason: 'opted_out' | 'replied' = 'replied'
): Promise<number> {
  const result = await prisma.dripEnrollment.updateMany({
    where: { customerId, status: 'active' },
    data: { status: 'stopped', stopReason: reason, completedAt: new Date() },
  })
  return result.count
}

/**
 * Run due drip steps. Called by cron worker every minute.
 * Processes up to 100 enrollments per run to avoid overload.
 */
export async function runDripWorker(limit = 100): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date()
  const due = await prisma.dripEnrollment.findMany({
    where: { status: 'active', nextRunAt: { lte: now } },
    include: {
      sequence: { include: { steps: { orderBy: { position: 'asc' } } } },
      customer: true,
    },
    take: limit,
  })

  let processed = 0
  let sent = 0
  let failed = 0

  for (const enrollment of due) {
    processed++
    const step = enrollment.sequence.steps.find((s) => s.position === enrollment.currentStep)
    if (!step) {
      // No more steps — mark completed
      await prisma.dripEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'completed', completedAt: new Date() },
      })
      continue
    }

    try {
      // Resolve template variables
      const ctx = await buildContextForCustomer(enrollment.customerId, enrollment.businessId)
      let messageBody = step.messageBody || ''
      let templateParams: string[] = []

      if (step.templateParams) {
        const refs: string[] = JSON.parse(step.templateParams)
        templateParams = refs.map((ref) => {
          // ref can be like 'name' or 'customer.last_treatment'
          return ctx[ref] || ctx[`customer.${ref}`] || ''
        })
      }
      if (messageBody) {
        messageBody = fillTemplate(messageBody, ctx)
      }

      // Send
      const result = await sendWhatsAppMessage(
        {
          to: enrollment.customer.phone,
          message: messageBody,
          type: step.templateName ? 'template' : 'text',
          templateName: step.templateName || undefined,
          templateParams: templateParams.length ? templateParams : undefined,
          templateLanguage: step.templateLang || 'en',
        },
        { businessId: enrollment.businessId }
      )

      if (result.success) {
        sent++
        await prisma.dripExecution.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            status: 'sent',
            externalId: result.messageId,
          },
        })

        // Advance to next step
        const nextStepIndex = enrollment.currentStep + 1
        const nextStep = enrollment.sequence.steps.find((s) => s.position === nextStepIndex)
        if (nextStep) {
          await prisma.dripEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStep: nextStepIndex,
              lastStepAt: new Date(),
              nextRunAt: new Date(Date.now() + nextStep.delayHours * 3600 * 1000),
            },
          })
        } else {
          // Sequence complete
          await prisma.dripEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'completed',
              lastStepAt: new Date(),
              completedAt: new Date(),
            },
          })
        }
      } else {
        throw new Error(result.error || 'send failed')
      }
    } catch (err: any) {
      failed++
      console.error(`[drip] enrollment ${enrollment.id} step ${step.id} failed:`, err)
      await prisma.dripExecution.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          status: 'failed',
          error: err.message?.slice(0, 500),
        },
      })
      // Retry once after 1 hour, then mark failed after 3 attempts
      const recentFailures = await prisma.dripExecution.count({
        where: { enrollmentId: enrollment.id, status: 'failed' },
      })
      if (recentFailures >= 3) {
        await prisma.dripEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'failed', stopReason: 'failed', completedAt: new Date() },
        })
      } else {
        await prisma.dripEnrollment.update({
          where: { id: enrollment.id },
          data: { nextRunAt: new Date(Date.now() + 3600 * 1000) },
        })
      }
    }
  }

  return { processed, sent, failed }
}

/**
 * Build a template context for a customer (loads business + custom field values).
 */
async function buildContextForCustomer(customerId: string, businessId: string) {
  const [customer, business, customFieldDefs, customFieldValues] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { customFieldValues: { include: { field: true } } },
    }),
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.customField.findMany({ where: { businessId, active: true } }),
    Promise.resolve([]),
  ])
  if (!customer || !business) return {}
  return buildTemplateContext({
    customer: { ...customer, customFieldValues: customer.customFieldValues || [] },
    business: {
      name: business.name,
      ownerName: business.ownerName,
      city: business.city,
      language: business.language,
      currency: business.currency,
    },
    customFieldDefs,
  })
}

/**
 * Trigger enrollments for a customer based on an event.
 * Called from webhook handlers, customer create, appointment status change, etc.
 */
export async function triggerDripsForEvent(
  businessId: string,
  event: DripTrigger,
  customerId: string,
  eventData?: Record<string, any>
): Promise<number> {
  const sequences = await prisma.dripSequence.findMany({
    where: { businessId, trigger: event, status: 'active' },
  })
  if (sequences.length === 0) return 0

  // For tag_added, check the triggerConfig for matching tag
  const eligible = sequences.filter((s) => {
    if (event === 'tag_added' && s.triggerConfig) {
      try {
        const cfg = JSON.parse(s.triggerConfig)
        if (cfg.tag && eventData?.tag !== cfg.tag) return false
      } catch { /* ignore */ }
    }
    return true
  })

  let enrolled = 0
  for (const seq of eligible) {
    const result = await enrollCustomer(seq.id, customerId)
    if (result.enrolled) enrolled++
  }
  return enrolled
}
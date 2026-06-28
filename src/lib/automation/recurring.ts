// Feature #3: Recurring appointments
// When an appointment is completed, automatically create the next one
// based on recurrenceRule (e.g. "every 6 months", "every year")
// Customer can confirm/cancel via WhatsApp

import { prisma } from '@/lib/db'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { generateWithCustomPrompt } from '@/lib/ai'

const DEFAULT_RECURRENCE_DAYS: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
}

export function parseRecurrenceRule(rule: string): { days: number; label: string } | null {
  if (DEFAULT_RECURRENCE_DAYS[rule]) {
    return { days: DEFAULT_RECURRENCE_DAYS[rule], label: rule }
  }
  // Custom: "90d" pattern
  const m = rule.match(/^(\d+)d$/)
  if (m) {
    return { days: parseInt(m[1]), label: `${m[1]} days` }
  }
  return null
}

// Called after an appointment is marked completed
// Creates next occurrence if recurrenceRule is set
export async function scheduleNextOccurrence(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { customer: true, service: true },
  })
  if (!appt) return null
  if (!appt.recurrenceRule) return null

  const rule = parseRecurrenceRule(appt.recurrenceRule)
  if (!rule) return null

  const nextStart = new Date(appt.startsAt.getTime() + rule.days * 86400000)
  const nextEnd = new Date(nextStart.getTime() + (appt.endsAt.getTime() - appt.startsAt.getTime()))

  const next = await prisma.appointment.create({
    data: {
      businessId: appt.businessId,
      customerId: appt.customerId,
      serviceId: appt.serviceId,
      startsAt: nextStart,
      endsAt: nextEnd,
      status: 'pending_confirmation', // Customer must confirm
      source: 'recurring',
      notes: `Auto-scheduled from recurring appointment (${rule.label})`,
      parentAppointmentId: appt.id,
      recurrenceRule: appt.recurrenceRule,
    },
  })

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { nextOccurrenceId: next.id },
  })

  // Notify customer
  await notifyRecurringAppointment(next, appt)

  return next
}

async function notifyRecurringAppointment(next: any, original: any) {
  const business = await prisma.business.findUnique({ where: { id: next.businessId } })
  if (!business) return

  const customer = await prisma.customer.findUnique({ where: { id: next.customerId } })
  if (!customer) return

  const serviceName = original.service?.name || 'your service'
  const firstName = customer.name.split(' ')[0]
  const dateStr = next.startsAt.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const timeStr = next.startsAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })

  const message = await generateWithCustomPrompt(`You are a friendly ${business.vertical} business manager. Write a brief Hinglish message asking the customer to confirm their recurring appointment. Under 3 sentences, include date/time, ask them to reply YES to confirm.`, `Customer ${firstName}. Recurring ${serviceName} appointment proposed for ${dateStr} at ${timeStr}. Ask for confirmation.`)

  const defaultMessage = `${firstName} जी, आपका अगला ${serviceName} appointment तैयार है:\n📅 ${dateStr}\n⏰ ${timeStr}\n\nConfirm करने के लिए "YES" reply करें, या नया time बताएं।\nReschedule करने के लिए "RESCHEDULE" लिखें।`

  const finalMessage = message || defaultMessage

  const result = await sendWhatsAppMessage({
    to: customer.phone,
    message: finalMessage,
  }, { businessId: business.id })

  await prisma.automationEvent.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      appointmentId: next.id,
      type: 'recurring_reminder',
      status: result.success ? 'sent' : 'failed',
      channel: 'whatsapp',
      message: finalMessage,
      error: result.success ? null : (result as any).error,
    },
  })
}
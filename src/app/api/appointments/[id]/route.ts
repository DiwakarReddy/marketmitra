import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scheduleNextOccurrence } from '@/lib/automation/recurring'
import { triggerDripsForEvent } from '@/lib/drips'

// PATCH /api/appointments/:id
// Update appointment status, notes, etc.
// Triggers side effects:
//   - status: 'completed' → schedule recurring appointment
//   - status: 'cancelled' → notify waitlist
//   - status: 'no_show' → log analytics

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !(session as any).businessId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const businessId = (session as any).businessId
  const apptId = params.id
  const body = await req.json()

  const appt = await prisma.appointment.findUnique({ where: { id: apptId } })
  if (!appt || appt.businessId !== businessId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const oldStatus = appt.status
  const newStatus = body.status || oldStatus

  const updated = await prisma.appointment.update({
    where: { id: apptId },
    data: {
      status: newStatus,
      notes: body.notes !== undefined ? body.notes : appt.notes,
      confirmedAt: body.confirmed ? new Date() : appt.confirmedAt,
      recurrenceRule: body.recurrenceRule !== undefined ? body.recurrenceRule : appt.recurrenceRule,
    },
  })

  // Side effects on status change
  if (oldStatus !== newStatus) {
    await prisma.activity.create({
      data: {
        businessId,
        type: `appointment_${newStatus}`,
        actor: 'owner',
        title: `Appointment ${newStatus}`,
        description: `Customer appointment status changed from ${oldStatus} to ${newStatus}`,
      },
    })

    // TRIGGER: Completed → schedule recurring
    if (newStatus === 'completed' && (appt.recurrenceRule || body.recurrenceRule)) {
      try {
        const next = await scheduleNextOccurrence(apptId)
        if (next) {
          await prisma.activity.create({
            data: {
              businessId,
              type: 'recurring_scheduled',
              actor: 'ai',
              title: 'Recurring appointment scheduled',
              description: `Next visit auto-scheduled for ${next.startsAt.toLocaleDateString('en-IN')}`,
            },
          })
        }
      } catch (err) {
        console.error('[recurring] Failed to schedule next occurrence:', err)
      }
    }

    // TRIGGER: Completed → fire post-visit drip sequences
    if (newStatus === 'completed' && oldStatus !== 'completed') {
      try {
        await triggerDripsForEvent(businessId, 'appointment_completed', appt.customerId)
      } catch (err) {
        console.error('[drips] Failed to trigger appointment_completed drip:', err)
      }
    }

    // TRIGGER: Cancelled → add to waitlist
    if (newStatus === 'cancelled' && appt.startsAt > new Date()) {
      // (would notify waitlist - implemented in waitlist feature)
      console.log('[waitlist] Slot freed:', apptId)
    }
  }

  return NextResponse.json({ ok: true, appointment: updated })
}
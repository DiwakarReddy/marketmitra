import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { CalendarClient } from './calendar-client'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [appointments, services] = await Promise.all([
    prisma.appointment.findMany({
      where: { businessId },
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
      take: 500,
    }),
    prisma.service.findMany({ where: { businessId } }),
  ])

  return <CalendarClient initialAppointments={appointments as any} services={services as any} />
}
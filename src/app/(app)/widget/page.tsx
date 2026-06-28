import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { WidgetCustomizer } from './widget-customizer'

export const dynamic = 'force-dynamic'

export default async function WidgetPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId
  if (!businessId) return <div className="p-6">Please sign in</div>

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) return <div className="p-6">Business not found</div>

  return <WidgetCustomizer businessId={businessId} businessName={business.name} businessCity={business.city} />
}
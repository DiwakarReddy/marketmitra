// /widget/preview?businessId=xxx — Live preview of the booking widget
// Used by the "Test" button on the Widget customizer page (was returning 404).
// Loads embed.js with the configured theme and renders a demo website with the floating button.

import { prisma } from '@/lib/db'
import { WidgetPreviewClient } from './widget-preview-client'

export const dynamic = 'force-dynamic'

export default async function WidgetPreviewPage({ searchParams }: { searchParams: { businessId?: string } }) {
  const businessId = searchParams.businessId
  if (!businessId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="text-center">
          <p className="text-ink-700 font-medium">Missing businessId</p>
          <p className="text-sm text-ink-500 mt-1">Open this page from the Booking Widget page.</p>
        </div>
      </div>
    )
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, city: true, state: true, services: { where: { active: true }, take: 8 } },
  })
  if (!business) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <p className="text-ink-700 font-medium">Business not found</p>
      </div>
    )
  }

  return (
    <WidgetPreviewClient
      businessId={businessId}
      businessName={business.name}
      businessCity={business.city}
      services={business.services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, pricePaise: s.pricePaise }))}
    />
  )
}
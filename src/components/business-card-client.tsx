'use client'

// Client-side business card — fetches data via API
// Used inside the client sidebar (which needs usePathname for active state)

import { useState, useEffect } from 'react'
import { getInitials, getAvatarColor } from '@/lib/utils'

interface BusinessInfo {
  name: string
  city: string | null
  state: string | null
  plan: string
  vertical: string
}

export function BusinessCardClient({ businessId: initialBusinessId }: { businessId?: string } = {}) {
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const businessId = initialBusinessId

  useEffect(() => {
    if (!businessId) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/me/business')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return
        if (data?.business) setBusiness(data.business)
      })
      .catch(() => { /* silent — fallback UI shown */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [businessId])

  if (loading) {
    return (
      <div className="w-full flex items-center gap-2.5 p-2 rounded-lg">
        <div className="w-8 h-8 bg-ink-100 rounded-lg animate-pulse" />
        <div className="flex-1">
          <div className="h-3 bg-ink-100 rounded animate-pulse mb-1" />
          <div className="h-2 bg-ink-100 rounded animate-pulse w-2/3" />
        </div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="w-full flex items-center gap-2.5 p-2 rounded-lg">
        <div className="w-8 h-8 bg-ink-200 rounded-lg flex items-center justify-center text-ink-500 text-xs font-bold">?</div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-semibold text-ink-500 truncate">No business</div>
        </div>
      </div>
    )
  }

  const initials = getInitials(business.name)
  const avatarColor = getAvatarColor(business.name)
  const location = [business.city, business.state].filter(Boolean).join(', ')

  return (
    <button className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-ink-50 transition">
      <div className={`w-8 h-8 bg-gradient-to-br ${avatarColor} rounded-lg flex items-center justify-center text-white text-xs font-bold`}>
        {initials}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold text-ink-900 truncate">{business.name}</div>
        <div className="text-[11px] text-ink-500 truncate">
          {location || 'Location not set'}
          {business.plan && business.plan !== 'trial' && (
            <span className="ml-1.5 text-teal-600">• {business.plan}</span>
          )}
        </div>
      </div>
    </button>
  )
}
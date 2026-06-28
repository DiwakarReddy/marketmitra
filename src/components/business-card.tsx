import { prisma } from '@/lib/db'
import { getInitials, getAvatarColor } from '@/lib/utils'

// Server component — fetches real business data from session
// Pass businessId from server context (middleware/layout)

export async function BusinessCard({ businessId }: { businessId: string }) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      city: true,
      state: true,
      vertical: true,
      plan: true,
    },
  })

  if (!business) {
    return (
      <div className="p-3 border-b border-ink-100">
        <div className="w-full flex items-center gap-2.5 p-2 rounded-lg bg-ink-50">
          <div className="w-8 h-8 bg-ink-200 rounded-lg flex items-center justify-center text-ink-500 text-xs font-bold">?</div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-semibold text-ink-500 truncate">Business not found</div>
          </div>
        </div>
      </div>
    )
  }

  const initials = getInitials(business.name)
  const avatarColor = getAvatarColor(business.name)
  const location = [business.city, business.state].filter(Boolean).join(', ')

  return (
    <div className="p-3 border-b border-ink-100">
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
    </div>
  )
}
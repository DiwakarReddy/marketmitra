'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLang } from '@/components/language-toggle'
import { t } from '@/lib/i18n'
import { BusinessCardClient } from '@/components/business-card-client'
import { canConnectChannel } from '@/lib/plan-features'
import {
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Users,
  CheckCircle2,
  Phone,
  Instagram,
  Target,
  BookOpen,
  Settings,
  Receipt,
  Sparkles,
  LogOut,
  BarChart3,
  FileText,
  Code,
  AlertCircle,
  CalendarDays,
  Building2,
} from 'lucide-react'

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, badgeKey: null as keyof SidebarCounts | null },
  { href: '/inbox', label: 'WhatsApp Inbox', icon: MessageSquare, badgeKey: 'inbox' as keyof SidebarCounts },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, badgeKey: null },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, badgeKey: 'campaigns' as keyof SidebarCounts },
  { href: '/customers', label: 'Customers', icon: Users, badgeKey: null },
  { href: '/leads', label: 'Leads & Revenue', icon: BarChart3, badgeKey: null },
  { href: '/approvals', label: 'Approvals', icon: CheckCircle2, badgeKey: 'approvals' as keyof SidebarCounts, badgeColor: 'red' },
  { href: '/failures', label: 'Failed Messages', icon: AlertCircle, badgeKey: 'failures' as keyof SidebarCounts },
]

const channelsNav = [
  { href: '/channels/whatsapp', label: 'WhatsApp', icon: MessageSquare, channelKey: 'whatsapp' },
  { href: '/channels/voice', label: 'Voice AI', icon: Phone, badge: 'New', channelKey: 'voice' },
  { href: '/channels/instagram', label: 'Instagram', icon: Instagram, channelKey: 'instagram' },
  { href: '/channels/google', label: 'Google Ads', icon: Target, channelKey: 'google_ads' },
]

const accountNav = [
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { href: '/widget', label: 'Booking Widget', icon: Code },
  { href: '/templates', label: 'Templates', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/billing', label: 'Billing', icon: Receipt },
]

const mainNavLabels = ['nav.dashboard', 'nav.inbox', 'nav.calendar', 'nav.campaigns', 'nav.customers', 'nav.leads', 'nav.approvals', 'nav.failures']
const accountNavLabels = ['nav.knowledge', 'nav.widget', 'nav.templates', 'nav.settings', 'nav.billing']

interface SidebarCounts {
  inbox: number
  campaigns: number
  approvals: number
  failures: number
}

export function Sidebar({
  businessId,
  userPlan,
  userRole,
  userEmail,
}: {
  businessId?: string
  userPlan?: string
  userRole?: string
  userEmail?: string | null
}) {
  const pathname = usePathname()
  const { lang } = useLang()
  const tt = (key: string) => t(key, lang)

  // Hide channel links not in plan
  const isAdmin = userEmail && process.env.NEXT_PUBLIC_ADMIN_EMAIL && userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const isOwner = userRole === 'owner' || isAdmin

  // Dynamic sidebar counts (replaces hardcoded badges)
  const [counts, setCounts] = useState<SidebarCounts>({ inbox: 0, campaigns: 0, approvals: 0, failures: 0 })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/me/sidebar-counts', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && typeof data?.inbox === 'number') setCounts(data)
      } catch {}
    }
    load()
    const interval = setInterval(load, 30000) // refresh every 30s
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <aside className="w-64 bg-white border-r border-ink-100 flex flex-col flex-shrink-0 h-screen">
      <div className="p-5 border-b border-ink-100">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-9 h-9 gradient-brand rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">M</span>
          </div>
          <div>
            <div className="font-bold text-ink-900 text-base leading-tight">MarketMitra</div>
            <div className="text-[10px] text-ink-500 leading-tight">तुम्हारा AI मार्केटिंग दोस्त</div>
          </div>
        </Link>
      </div>

      <div className="p-3 border-b border-ink-100">
        <BusinessCardClient businessId={businessId} />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-hide">
        <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold px-3 pt-2 pb-1">Main</div>
        {mainNav.map((item, idx) => {
          const Icon = item.icon
          const active = pathname === item.href
          const dynamicCount = item.badgeKey ? counts[item.badgeKey] : 0
          const showBadge = (item.badgeKey && dynamicCount > 0)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active ? 'bg-teal-50 text-teal-700' : 'text-ink-700 hover:bg-ink-50'
              )}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-teal-700' : 'text-ink-500')} />
              <span>{tt(mainNavLabels[idx])}</span>
              {showBadge && (
                <span className={cn(
                  'ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center',
                  item.badgeColor === 'red' ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-700'
                )}>
                  {dynamicCount > 99 ? '99+' : dynamicCount}
                </span>
              )}
            </Link>
          )
        })}

        <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold px-3 pt-4 pb-1">Channels</div>
        {channelsNav.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          const allowed = canConnectChannel(userPlan || 'trial', item.channelKey as any)
          if (!allowed) return null // Hide if not in plan
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active ? 'bg-teal-50 text-teal-700' : 'text-ink-700 hover:bg-ink-50'
              )}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-teal-700' : 'text-ink-500')} />
              <span>{item.label}</span>
              {(item as any).badge && (
                <span className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                  {(item as any).badge}
                </span>
              )}
            </Link>
          )
        })}

        <div className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold px-3 pt-4 pb-1">Account</div>
        {accountNav.map((item, idx) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active ? 'bg-teal-50 text-teal-700' : 'text-ink-700 hover:bg-ink-50'
              )}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-teal-700' : 'text-ink-500')} />
              <span>{tt(accountNavLabels[idx])}</span>
            </Link>
          )
        })}

        <Link
          href="/plans"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-teal-700 bg-gradient-to-r from-teal-50 to-cyan-50 mt-2 hover:from-teal-100 hover:to-cyan-100 transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>{tt('nav.plans')}</span>
        </Link>

        <Link
          href="/admin"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold text-red-700 bg-red-50/50 mt-1 hover:bg-red-50 transition"
        >
          <Building2 className="w-4 h-4" />
          <span>Admin</span>
          <span className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700">F</span>
        </Link>
      </nav>

      <div className="p-3 border-t border-ink-100 space-y-1">
        <div className="flex items-center gap-2 px-3 py-2">
          <LanguageToggle />
        </div>
        <Link href="/login" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50 transition">
          <LogOut className="w-4 h-4 text-ink-500" />
          <span>{tt('common.signOut')}</span>
        </Link>
      </div>
    </aside>
  )
}

function LanguageToggle() {
  const { lang, setLang } = useLang()
  const opts = [
    { code: 'en', label: 'EN' },
    { code: 'hi', label: 'हिं' },
    { code: 'hinglish', label: 'Hi-EN' },
  ]
  return (
    <div className="flex items-center bg-ink-100 rounded-lg p-0.5 text-xs font-semibold">
      {opts.map((o) => (
        <button
          key={o.code}
          onClick={() => setLang(o.code as any)}
          className={cn(
            'px-2 py-1 rounded transition',
            lang === o.code ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

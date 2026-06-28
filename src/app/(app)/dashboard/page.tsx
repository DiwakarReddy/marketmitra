import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpRight, CheckCircle2, Megaphone, Users, Calendar, IndianRupee, TrendingUp, Sparkles, Target, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 30 // re-render every 30s for near-realtime

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const last7d = new Date(Date.now() - 7 * 86400000)
  const last30d = new Date(Date.now() - 30 * 86400000)
  const prev30d = new Date(Date.now() - 60 * 86400000)

  const [
    business,
    todayBookings,
    todayLeads,
    todayRevenue,
    monthBookings,
    monthRevenue,
    last30dBookings,
    prev30dBookings,
    pendingApprovals,
    activeConversations,
    recentActivity,
    todayAppointments,
  ] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: today, lt: tomorrow } } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: today } } }),
    prisma.lead.aggregate({ where: { businessId, status: 'paid', lastTouchAt: { gte: today } }, _sum: { valuePaise: true } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } } }),
    prisma.lead.aggregate({ where: { businessId, status: 'paid', lastTouchAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } }, _sum: { valuePaise: true } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: last30d } } }),
    prisma.appointment.count({ where: { businessId, createdAt: { gte: prev30d, lt: last30d } } }),
    prisma.approval.count({ where: { businessId, status: 'pending' } }),
    prisma.conversation.count({ where: { businessId, status: 'ai_handling' } }),
    prisma.activity.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.appointment.findMany({
      where: { businessId, startsAt: { gte: today, lt: tomorrow } },
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
      take: 5,
    }),
  ])

  const wowBookings = last30dBookings - prev30dBookings
  const wowPct = prev30dBookings > 0 ? Math.round((wowBookings / prev30dBookings) * 100) : 0

  // AI goals (this month)
  const monthGoal = 100
  const goalProgress = Math.round((monthBookings / monthGoal) * 100)

  const isPaused = !!business?.pausedAt

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8">
      {isPaused && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-amber-900">Your account is paused</h2>
            <p className="text-sm text-amber-700 mt-1">
              AI is not sending messages or campaigns. Go to <Link href="/settings" className="underline font-medium">Settings</Link> to unpause.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-sm text-ink-500 mb-1">
            {today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 className="text-3xl font-bold text-ink-900">नमस्ते, {business?.ownerName?.split(' ')[0] || 'Doctor'} 🙏</h1>
          <p className="text-ink-600 mt-1">
            आज AI ने <strong>{todayBookings}</strong> appointments book किए हैं। {pendingApprovals} approvals pending.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/calendar"><Calendar className="w-4 h-4" />Today</Link>
          </Button>
          <Button variant="brand" size="sm" asChild>
            <Link href="/campaigns"><Megaphone className="w-4 h-4" />New campaign</Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Today leads" value={todayLeads} delta={`${wowPct >= 0 ? '+' : ''}${wowPct}% wow`} deltaPositive={wowPct >= 0} icon={Users} color="teal" />
        <StatCard label="Today bookings" value={todayBookings} delta={`${monthBookings} this month`} icon={CheckCircle2} color="green" />
        <StatCard label="Today revenue" value={`₹${((todayRevenue._sum.valuePaise || 0) / 100).toLocaleString('en-IN')}`} delta="from paid leads" icon={IndianRupee} color="amber" />
        <StatCard label="Active chats" value={activeConversations} delta="AI handling" icon={Sparkles} color="purple" />
      </div>

      {/* Monthly goal */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-teal-600" />
              <h3 className="font-bold text-ink-900">Monthly goal</h3>
              <Badge>{monthBookings}/{monthGoal} bookings</Badge>
            </div>
            <div className="text-2xl font-bold text-teal-700">{goalProgress}%</div>
          </div>
          <div className="h-3 bg-ink-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all" style={{ width: `${Math.min(100, goalProgress)}%` }} />
          </div>
          <p className="text-xs text-ink-500 mt-2">
            {Math.max(0, monthGoal - monthBookings)} more bookings to hit your goal. AI is working on it.
          </p>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-ink-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <div className="text-xs text-ink-500 mt-0.5 flex items-center gap-1">
                  <span className="pulse-dot" /> Live • auto-refreshes every 30s
                </div>
              </div>
              <Button size="sm" variant="ghost" asChild>
                <Link href="/leads">All activity <ArrowRight className="w-3 h-3" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivity.length === 0 ? (
              <div className="p-8 text-center text-ink-500 text-sm">No activity yet</div>
            ) : (
              <div className="divide-y divide-ink-100">
                {recentActivity.map((a) => (
                  <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-ink-50/50">
                    <div className="w-8 h-8 bg-ink-50 rounded-full flex items-center justify-center flex-shrink-0 text-base">
                      {a.type === 'campaign_created' ? '📢' :
                       a.type.startsWith('appointment_') ? '📅' :
                       a.type === 'review_request' ? '⭐' :
                       a.type === 'birthday_wish' ? '🎂' :
                       a.type === 'festival_campaign' ? '🪔' :
                       a.type === 'no_show' ? '⚠️' :
                       a.type === 'integration_connected' ? '🔌' : '•'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-900">{a.title}</div>
                      {a.description && <div className="text-xs text-ink-500 truncate">{a.description}</div>}
                    </div>
                    <div className="text-xs text-ink-400 flex-shrink-0">
                      {timeAgo(new Date(a.createdAt))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's appointments */}
        <Card>
          <CardHeader className="border-b border-ink-100">
            <CardTitle>Today's appointments</CardTitle>
            <div className="text-xs text-ink-500 mt-0.5">{todayAppointments.length} bookings</div>
          </CardHeader>
          <CardContent className="p-0">
            {todayAppointments.length === 0 ? (
              <div className="p-8 text-center text-ink-500 text-sm">No appointments today</div>
            ) : (
              <div className="divide-y divide-ink-100">
                {todayAppointments.map((a) => (
                  <div key={a.id} className="p-3 flex items-center gap-3">
                    <div className="w-12 text-center">
                      <div className="text-xs text-ink-500">{new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{a.customer.name}</div>
                      <div className="text-xs text-ink-500 truncate">{a.service?.name || 'No service'}</div>
                    </div>
                    <Badge variant="secondary">{a.source}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, delta, deltaPositive, icon: Icon, color, gradient }: any) {
  return (
    <Card className={gradient ? 'bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <div className={`text-xs font-medium uppercase tracking-wider ${gradient ? 'text-teal-100' : 'text-ink-500'}`}>{label}</div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-${color}-50 text-${color}-700`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="text-3xl font-bold">{value}</div>
        {delta && (
          <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${gradient ? 'text-teal-100' : deltaPositive ? 'text-green-600' : 'text-ink-500'}`}>
            {deltaPositive && <ArrowUpRight className="w-3 h-3" />}
            {delta}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
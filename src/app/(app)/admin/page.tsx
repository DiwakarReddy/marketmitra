import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, IndianRupee, Users, TrendingUp, AlertCircle, Activity, CheckCircle2, XCircle } from 'lucide-react'
import { getAdminStats, getRecentBusinesses, getRecentActivity } from '@/lib/admin'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

// Admin dashboard — founder view
// Only accessible if user email matches ADMIN_EMAIL env var
// (In production, add proper role check)

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.ADMIN_EMAIL

  if (!session?.user || (adminEmail && session.user.email !== adminEmail)) {
    redirect('/dashboard')
  }

  const [stats, businesses, activity] = await Promise.all([
    getAdminStats(),
    getRecentBusinesses(20),
    getRecentActivity(30),
  ])

  const planBadge: Record<string, any> = {
    starter: { variant: 'secondary', label: 'Starter' },
    growth: { variant: 'default', label: 'Growth' },
    scale: { variant: 'success', label: 'Scale' },
    trial: { variant: 'warning', label: 'Trial' },
    suspended: { variant: 'danger', label: 'Suspended' },
    starter_paused: { variant: 'warning', label: 'Paused' },
  }

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-teal-600" />
            Admin Dashboard
          </h1>
          <p className="text-ink-600 mt-1">Founder view. Monitor all businesses, MRR, churn, and system health.</p>
        </div>
        <Badge variant="danger">INTERNAL</Badge>
      </div>

      {/* MRR / ARR */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0">
          <CardContent className="p-5">
            <div className="text-xs text-teal-100 uppercase tracking-wider mb-1">MRR</div>
            <div className="text-3xl font-bold">₹{(stats.mrrPaise / 100).toLocaleString('en-IN')}</div>
            <div className="text-xs text-teal-100 mt-1">Monthly recurring</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">ARR</div>
            <div className="text-3xl font-bold text-ink-900">₹{(stats.arrPaise / 100).toLocaleString('en-IN')}</div>
            <div className="text-xs text-ink-500 mt-1">Annualized</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Total businesses</div>
            <div className="text-3xl font-bold text-ink-900">{stats.totalBusinesses}</div>
            <div className="text-xs text-green-600 mt-1">+{stats.newSignupsLast7d} this week</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Active</div>
            <div className="text-3xl font-bold text-ink-900">{stats.activeBusinesses}</div>
            <div className="text-xs text-ink-500 mt-1">{stats.trialBusinesses} in trial</div>
          </CardContent>
        </Card>
      </div>

      {/* Health alerts */}
      {(stats.failedMessages > 0 || stats.failedPaymentsCount > 0 || stats.suspendedBusinesses > 0) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-ink-900 mb-2">Attention needed</div>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  {stats.failedMessages > 0 && (
                    <div>
                      <div className="font-semibold text-ink-900">{stats.failedMessages} failed messages</div>
                      <div className="text-ink-600">Check WhatsApp provider health</div>
                    </div>
                  )}
                  {stats.failedPaymentsCount > 0 && (
                    <div>
                      <div className="font-semibold text-ink-900">
                        {stats.failedPaymentsCount} failed payments
                        <span className="text-ink-600 font-normal"> (₹{(stats.failedPaymentsPaise / 100).toLocaleString('en-IN')})</span>
                      </div>
                      <div className="text-ink-600">Dunning will auto-retry</div>
                    </div>
                  )}
                  {stats.suspendedBusinesses > 0 && (
                    <div>
                      <div className="font-semibold text-ink-900">{stats.suspendedBusinesses} suspended accounts</div>
                      <div className="text-ink-600">Manual outreach needed</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Total customers</div>
            <div className="text-2xl font-bold text-ink-900">{stats.totalCustomers.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Total bookings</div>
            <div className="text-2xl font-bold text-ink-900">{stats.totalBookings.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Revenue (lifetime)</div>
            <div className="text-2xl font-bold text-teal-700">₹{(stats.totalRevenuePaise / 100).toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">Messages exchanged</div>
            <div className="text-2xl font-bold text-ink-900">{stats.totalMessagesExchanged.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent businesses */}
      <Card>
        <CardHeader>
          <CardTitle>Recent businesses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs text-ink-500 uppercase">
                <tr>
                  <th className="text-left p-3">Business</th>
                  <th className="text-left p-3">Owner</th>
                  <th className="text-left p-3">City</th>
                  <th className="text-left p-3">Plan</th>
                  <th className="text-right p-3">Customers</th>
                  <th className="text-right p-3">Bookings</th>
                  <th className="text-left p-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {businesses.map((b) => {
                  const badge = planBadge[b.plan] || { variant: 'secondary', label: b.plan }
                  return (
                    <tr key={b.id} className="hover:bg-ink-50/50">
                      <td className="p-3 font-medium text-ink-900">{b.name}</td>
                      <td className="p-3 text-ink-600">{b.ownerName}</td>
                      <td className="p-3 text-ink-600">{b.city}</td>
                      <td className="p-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="p-3 text-right text-ink-900">{b._count.customers}</td>
                      <td className="p-3 text-right text-ink-900">{b._count.appointments}</td>
                      <td className="p-3 text-ink-500 text-xs">{new Date(b.createdAt).toLocaleDateString('en-IN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent activity across all businesses</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-ink-100 max-h-[500px] overflow-y-auto">
            {activity.map((a) => (
              <div key={a.id} className="p-4 hover:bg-ink-50/50 flex items-start gap-3">
                <div className="w-8 h-8 bg-ink-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Activity className="w-4 h-4 text-ink-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-ink-900 text-sm truncate">{a.title}</span>
                    <span className="text-xs text-ink-500">•</span>
                    <span className="text-xs text-ink-500 truncate">{a.business?.name}</span>
                  </div>
                  {a.description && <div className="text-xs text-ink-600 truncate">{a.description}</div>}
                  <div className="text-[10px] text-ink-400 mt-0.5">
                    {new Date(a.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>
                <Badge variant="outline">{a.actor}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-ink-500">
        🔒 This page is internal. Only admins (matching ADMIN_EMAIL env var) can see this.
      </div>
    </div>
  )
}
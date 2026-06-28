import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, IndianRupee, Users, Calendar, ArrowRight, Target } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  // Source breakdown
  const leads = await prisma.lead.findMany({
    where: { businessId },
    include: { customer: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  // Aggregate by source
  const bySource: Record<string, { count: number; revenue: number; converted: number }> = {}
  for (const lead of leads) {
    const src = lead.source || 'unknown'
    if (!bySource[src]) bySource[src] = { count: 0, revenue: 0, converted: 0 }
    bySource[src].count++
    bySource[src].revenue += lead.valuePaise
    if (lead.status === 'paid' || lead.status === 'won') bySource[src].converted++
  }

  // Funnel
  const totalLeads = leads.length
  const contacted = leads.filter((l) => l.status !== 'new').length
  const booked = leads.filter((l) => l.status === 'booked' || l.status === 'completed' || l.status === 'paid').length
  const paid = leads.filter((l) => l.status === 'paid' || l.status === 'won').length
  const totalRevenue = leads.filter((l) => l.status === 'paid').reduce((s, l) => s + l.valuePaise, 0)

  // Last 7d vs previous 7d
  const last7dStart = new Date(Date.now() - 7 * 86400000)
  const last14dStart = new Date(Date.now() - 14 * 86400000)
  const recent = leads.filter((l) => l.createdAt >= last7dStart)
  const previous = leads.filter((l) => l.createdAt >= last14dStart && l.createdAt < last7dStart)
  const wowLeads = recent.length - previous.length
  const wowRev = recent.filter(l => l.status === 'paid').reduce((s, l) => s + l.valuePaise, 0) -
                  previous.filter(l => l.status === 'paid').reduce((s, l) => s + l.valuePaise, 0)

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">Leads & Revenue</h1>
        <p className="text-ink-600 mt-1">Track how customers find you, convert, and what they spend</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ink-500 uppercase tracking-wider">Total leads</div>
                <div className="text-2xl font-bold text-ink-900 mt-1">{totalLeads}</div>
                <div className={`text-xs mt-1 ${wowLeads >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {wowLeads >= 0 ? '↑' : '↓'} {Math.abs(wowLeads)} vs last week
                </div>
              </div>
              <Users className="w-8 h-8 text-blue-100" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ink-500 uppercase tracking-wider">Bookings</div>
                <div className="text-2xl font-bold text-ink-900 mt-1">{booked}</div>
                <div className="text-xs text-ink-500 mt-1">{totalLeads > 0 ? Math.round(booked / totalLeads * 100) : 0}% conversion</div>
              </div>
              <Calendar className="w-8 h-8 text-teal-100" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ink-500 uppercase tracking-wider">Revenue</div>
                <div className="text-2xl font-bold text-ink-900 mt-1">₹{(totalRevenue / 100).toLocaleString('en-IN')}</div>
                <div className={`text-xs mt-1 ${wowRev >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {wowRev >= 0 ? '↑' : '↓'} ₹{Math.abs(wowRev / 100).toFixed(0)} vs last week
                </div>
              </div>
              <IndianRupee className="w-8 h-8 text-green-100" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-ink-500 uppercase tracking-wider">Avg deal size</div>
                <div className="text-2xl font-bold text-ink-900 mt-1">
                  ₹{paid > 0 ? Math.round(totalRevenue / paid / 100).toLocaleString('en-IN') : '0'}
                </div>
                <div className="text-xs text-ink-500 mt-1">from {paid} paid leads</div>
              </div>
              <Target className="w-8 h-8 text-purple-100" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <FunnelStep label="Leads" value={totalLeads} max={totalLeads} color="bg-blue-500" />
            <FunnelStep label="Contacted" value={contacted} max={totalLeads} color="bg-cyan-500" />
            <FunnelStep label="Booked" value={booked} max={totalLeads} color="bg-teal-500" />
            <FunnelStep label="Paid" value={paid} max={totalLeads} color="bg-green-500" />
          </div>
        </CardContent>
      </Card>

      {/* Source breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>By source</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs text-ink-500 uppercase">
                <tr>
                  <th className="text-left p-3">Source</th>
                  <th className="text-right p-3">Leads</th>
                  <th className="text-right p-3">Converted</th>
                  <th className="text-right p-3">Conv. rate</th>
                  <th className="text-right p-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {Object.entries(bySource)
                  .sort(([, a], [, b]) => b.revenue - a.revenue)
                  .map(([source, data]) => (
                    <tr key={source}>
                      <td className="p-3 font-medium text-ink-900">{source}</td>
                      <td className="p-3 text-right">{data.count}</td>
                      <td className="p-3 text-right">{data.converted}</td>
                      <td className="p-3 text-right">
                        {data.count > 0 ? Math.round(data.converted / data.count * 100) : 0}%
                      </td>
                      <td className="p-3 text-right font-semibold text-ink-900">₹{(data.revenue / 100).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent leads */}
      <Card>
        <CardHeader>
          <CardTitle>Recent leads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-ink-100">
            {leads.slice(0, 20).map((lead) => {
              const statusVariant: any = {
                new: 'warning', booked: 'default', paid: 'success', won: 'success',
                lost: 'danger', completed: 'success', cancelled: 'secondary',
              }
              return (
                <div key={lead.id} className="p-3 flex items-center gap-3 hover:bg-ink-50/50">
                  <div className="w-10 h-10 bg-ink-100 rounded-full flex items-center justify-center text-ink-700 font-semibold text-sm">
                    {lead.customer?.name?.split(' ')[0]?.slice(0, 2).toUpperCase() || '??'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900 text-sm">{lead.customer?.name || 'Unknown'}</div>
                    <div className="text-xs text-ink-500">{lead.source} • {new Date(lead.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                  </div>
                  {lead.valuePaise > 0 && (
                    <div className="text-sm font-semibold text-ink-900">₹{(lead.valuePaise / 100).toLocaleString('en-IN')}</div>
                  )}
                  <Badge variant={statusVariant[lead.status] || 'secondary'}>{lead.status}</Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FunnelStep({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-ink-700">{label}</span>
        <span className="text-sm text-ink-500">{value} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-8 bg-ink-100 rounded-lg overflow-hidden">
        <div className={`${color} h-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
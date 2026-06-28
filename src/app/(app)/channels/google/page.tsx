import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Target, CheckCircle2, XCircle, TrendingUp, MousePointer, DollarSign, Eye, AlertCircle, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function GoogleChannelPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })

  // Stats from campaigns tagged as google_ads
  const [ads, totalSpend, totalRevenue] = await Promise.all([
    prisma.campaign.findMany({ where: { businessId, type: 'google_ads' } }),
    prisma.campaign.aggregate({ where: { businessId, type: 'google_ads' }, _sum: { spentPaise: true } }),
    prisma.lead.aggregate({ where: { businessId, source: 'google_ads', status: 'paid' }, _sum: { valuePaise: true } }),
  ])

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Target className="w-7 h-7 text-blue-600" />
            Google Ads
          </h1>
          <p className="text-ink-600 mt-1">AI creates and optimizes your ad campaigns 24/7</p>
        </div>
        <Badge variant={business?.googleAdsConnected ? 'success' : 'secondary'} className="text-sm px-3 py-1.5">
          {business?.googleAdsConnected ? <><CheckCircle2 className="w-4 h-4 mr-1" />Connected</> : <><XCircle className="w-4 h-4 mr-1" />Not connected</>}
        </Badge>
      </div>

      {!business?.googleAdsConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-amber-900">Google Ads not connected</div>
                <div className="text-sm text-amber-800 mt-1">
                  Get a Google Ads developer token and link your manager account.
                </div>
                <pre className="mt-3 p-3 bg-white border border-amber-200 rounded text-xs">
{`GOOGLE_ADS_DEVELOPER_TOKEN="xxxxx"
GOOGLE_ADS_CUSTOMER_ID="123-456-7890"
GOOGLE_ADS_REFRESH_TOKEN="xxxxx"`}
                </pre>
                <Link href="https://ads.google.com/home/tools/manager-accounts/" target="_blank" className="text-amber-700 underline mt-2 inline-block text-sm flex items-center gap-1">
                  Google Ads Manager <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Total spend</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">₹{((totalSpend._sum.spentPaise || 0) / 100).toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Revenue</div>
            <div className="text-2xl font-bold text-green-700 mt-1">₹{((totalRevenue._sum.valuePaise || 0) / 100).toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">ROAS</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">
              {totalSpend._sum.spentPaise ? ((totalRevenue._sum.valuePaise || 0) / totalSpend._sum.spentPaise).toFixed(2) : '—'}x
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Active campaigns</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{ads.filter((a) => a.status === 'running').length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What AI does on Google Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Feature icon={Target} title="Auto-create campaigns" desc="AI generates campaigns for your services + city" />
            <Feature icon={TrendingUp} title="Smart bidding" desc="Maximizes conversions at target CPA" />
            <Feature icon={MousePointer} title="Landing page optimization" desc="A/B tests booking widget variations" />
            <Feature icon={DollarSign} title="Budget allocation" desc="Shifts budget to best-performing campaigns" />
            <Feature icon={Eye} title="Negative keywords" desc="AI learns what NOT to bid on" />
            <Feature icon={TrendingUp} title="Weekly reports" desc="AI emails you what changed and why" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active campaigns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ads.length === 0 ? (
            <div className="p-8 text-center text-ink-500 text-sm">No Google Ads campaigns yet</div>
          ) : (
            <div className="divide-y divide-ink-100">
              {ads.slice(0, 10).map((a) => (
                <div key={a.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{a.name}</div>
                    <div className="text-xs text-ink-500">₹{(a.spentPaise / 100).toLocaleString('en-IN')} spent • {a.leads} leads</div>
                  </div>
                  <Badge>{a.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Feature({ icon: Icon, title, desc }: any) {
  return (
    <div className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg">
      <Icon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-ink-500">{desc}</div>
      </div>
    </div>
  )
}
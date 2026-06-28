import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MessageSquare, Phone, Instagram, Target, Calendar, CreditCard, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminChannelsPage() {
  const session = await getServerSession(authOptions)
  const adminEmail = process.env.ADMIN_EMAIL
  if (!session?.user || (adminEmail && session.user.email !== adminEmail)) {
    redirect('/dashboard')
  }

  const configs = await prisma.channelConfig.findMany({
    include: {
      business: { select: { id: true, name: true, ownerEmail: true, ownerName: true, plan: true, createdAt: true } },
    },
    orderBy: { lastUsedAt: 'desc' },
    take: 500,
  })

  const allBusinesses = await prisma.business.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, ownerEmail: true, ownerName: true, plan: true, createdAt: true },
  })

  // Group by business
  const byBusiness: Record<string, { business: any; channels: any[] }> = {}
  for (const cfg of configs) {
    if (!byBusiness[cfg.businessId]) {
      byBusiness[cfg.businessId] = { business: cfg.business, channels: [] }
    }
    byBusiness[cfg.businessId].channels.push(cfg)
  }
  for (const b of allBusinesses) {
    if (!byBusiness[b.id]) byBusiness[b.id] = { business: b, channels: [] }
  }

  // Get recent audit events (last 24h)
  const recentAudits = await prisma.channelConfigAudit.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 86400000) } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: { business: { select: { name: true } } },
  })

  const stats = {
    total: allBusinesses.length,
    withChannels: Object.values(byBusiness).filter((b) => b.channels.length > 0).length,
    whatsapp: configs.filter((c) => c.channel === 'whatsapp' && c.isActive).length,
    voice: configs.filter((c) => c.channel === 'voice' && c.isActive).length,
    instagram: configs.filter((c) => c.channel === 'instagram' && c.isActive).length,
    google_ads: configs.filter((c) => c.channel === 'google_ads' && c.isActive).length,
    razorpay: configs.filter((c) => c.channel === 'razorpay' && c.isActive).length,
    aiKeys: configs.filter((c) => (c.channel === 'openai' || c.channel === 'google_ai') && c.isActive).length,
  }

  const channelIcons: Record<string, any> = {
    whatsapp: MessageSquare, voice: Phone, instagram: Instagram,
    google_ads: Target, google_calendar: Calendar, razorpay: CreditCard,
    openai: Sparkles, google_ai: Sparkles,
  }

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
          <Building2 className="w-7 h-7 text-purple-600" />
          Channel Configs (All Tenants)
        </h1>
        <p className="text-ink-600 mt-1">View how each business has configured their integrations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Total businesses</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.total}</div>
            <div className="text-xs text-ink-500 mt-1">{stats.withChannels} have ≥1 channel</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">WhatsApp</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.whatsapp}</div>
            <div className="text-xs text-ink-500 mt-1">connected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Voice (Twilio)</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.voice}</div>
            <div className="text-xs text-ink-500 mt-1">connected</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">AI Keys (BYOK)</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.aiKeys}</div>
            <div className="text-xs text-ink-500 mt-1">businesses with own AI</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-business table */}
      <Card>
        <CardHeader>
          <CardTitle>Per-business configuration</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs text-ink-500 uppercase">
                <tr>
                  <th className="text-left p-3">Business</th>
                  <th className="text-left p-3">Owner</th>
                  <th className="text-left p-3">Plan</th>
                  <th className="text-left p-3">WhatsApp</th>
                  <th className="text-left p-3">Voice</th>
                  <th className="text-left p-3">Instagram</th>
                  <th className="text-left p-3">Google Ads</th>
                  <th className="text-left p-3">Razorpay</th>
                  <th className="text-left p-3">AI Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {Object.values(byBusiness).map(({ business, channels }) => {
                  const get = (c: string) => channels.find((ch: any) => ch.channel === c)
                  const isOk = (c: any) => c && c.isActive
                  const isTestFailed = (c: any) => c && c.lastTestStatus === 'failed'

                  return (
                    <tr key={business.id} className="hover:bg-ink-50/30">
                      <td className="p-3">
                        <div className="font-medium text-ink-900">{business.name}</div>
                        <div className="text-xs text-ink-500">{business.id.slice(-8)}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-ink-700">{business.ownerName}</div>
                        <div className="text-xs text-ink-500">{business.ownerEmail}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant={business.plan === 'starter' ? 'secondary' : 'default'}>
                          {business.plan}
                        </Badge>
                      </td>
                      {['whatsapp', 'voice', 'instagram', 'google_ads', 'razorpay'].map((c) => {
                        const cfg = get(c)
                        return (
                          <td key={c} className="p-3">
                            {isOk(cfg) ? (
                              isTestFailed(cfg) ? (
                                <Badge variant="danger" title={cfg.lastTestError}>
                                  <AlertCircle className="w-3 h-3 mr-0.5" />Failed
                                </Badge>
                              ) : (
                                <Badge variant="success">
                                  <CheckCircle2 className="w-3 h-3 mr-0.5" />OK
                                </Badge>
                              )
                            ) : (
                              <span className="text-ink-300 text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="p-3">
                        {(() => {
                          const openai = get('openai')
                          const google = get('google_ai')
                          if (isOk(openai)) return <Badge variant="success" className="text-[10px]">OpenAI</Badge>
                          if (isOk(google)) return <Badge variant="success" className="text-[10px]">Gemini</Badge>
                          return <span className="text-xs text-ink-400">Platform</span>
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-ink-500 text-center">
        🔒 Credentials are encrypted with AES-256-GCM. Founders cannot view raw secrets — only test status.
      </div>

      {/* Recent audit events (last 24h) */}
      {recentAudits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent credential events (24h)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-ink-100 max-h-[400px] overflow-y-auto">
              {recentAudits.map((e) => (
                <div key={e.id} className="p-3 flex items-center gap-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${
                    e.action === 'created' ? 'bg-green-500' :
                    e.action === 'rotated' ? 'bg-blue-500' :
                    e.action === 'deleted' ? 'bg-red-500' :
                    e.action === 'test_failed' ? 'bg-amber-500' :
                    e.action === 'rate_limited' ? 'bg-red-500' :
                    'bg-ink-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{e.action}</span> <span className="text-ink-500">on</span> <span className="font-medium">{e.channel}</span>
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {e.business?.name} • {e.actorEmail || e.actor} • {e.ipAddress}
                    </div>
                    {e.testError && <div className="text-xs text-red-600 mt-0.5">⚠️ {e.testError}</div>}
                  </div>
                  <div className="text-xs text-ink-500">
                    {new Date(e.createdAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
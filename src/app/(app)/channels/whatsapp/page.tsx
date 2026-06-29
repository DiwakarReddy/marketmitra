import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, MessageSquare, Phone, Sparkles, Calendar, Send, ExternalLink, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function WhatsAppChannelPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [business, stats, recentMessages, whatsappCfg] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.conversation.aggregate({
      where: { businessId },
      _count: { id: true },
    }),
    prisma.message.findMany({
      where: { conversation: { businessId } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { conversation: { include: { customer: true } } },
    }),
    prisma.channelConfig.findUnique({
      where: { businessId_channel: { businessId, channel: 'whatsapp' } },
    }),
  ])

  // Prefer per-tenant provider from channelConfig (set in Settings UI);
  // fall back to env var only if no per-tenant config exists.
  const providerDisplay = whatsappCfg?.isActive
    ? whatsappCfg.provider || 'configured (provider not set)'
    : (process.env.WHATSAPP_PROVIDER || 'mock (dev mode)')

  const totalMessages = await prisma.message.count({ where: { conversation: { businessId } } })
  const inboundMessages = await prisma.message.count({ where: { conversation: { businessId }, direction: 'inbound' } })
  const outboundMessages = await prisma.message.count({ where: { conversation: { businessId }, direction: 'outbound' } })

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-green-600" />
            WhatsApp Channel
          </h1>
          <p className="text-ink-600 mt-1">AI inbox, broadcasts, reactivation campaigns</p>
        </div>
        <Badge variant={business?.whatsappConnected ? 'success' : 'secondary'} className="text-sm px-3 py-1.5">
          {business?.whatsappConnected ? <><CheckCircle2 className="w-4 h-4 mr-1" />Connected</> : <><XCircle className="w-4 h-4 mr-1" />Not connected</>}
        </Badge>
      </div>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border border-ink-100 rounded-lg">
              <div className="text-xs text-ink-500">Phone number</div>
              <div className="font-medium text-ink-900">{business?.whatsappPhone || 'Not configured'}</div>
            </div>
            <div className="p-3 border border-ink-100 rounded-lg">
              <div className="text-xs text-ink-500">Provider</div>
              <div className="font-medium text-ink-900">{providerDisplay}</div>
            </div>
            <div className="p-3 border border-ink-100 rounded-lg">
              <div className="text-xs text-ink-500">Active conversations</div>
              <div className="font-medium text-ink-900">{stats._count.id}</div>
            </div>
            <div className="p-3 border border-ink-100 rounded-lg">
              <div className="text-xs text-ink-500">Total messages</div>
              <div className="font-medium text-ink-900">{totalMessages.toLocaleString('en-IN')}</div>
            </div>
          </div>

          {!business?.whatsappConnected && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold text-amber-900">WhatsApp not connected</div>
                  <div className="text-amber-800 mt-1">
                    Connect via Meta Cloud API, AiSensy, or 360dialog. Required credentials must be set in your environment.
                  </div>
                  <Link href="/settings" className="text-amber-700 underline mt-2 inline-block">Go to Settings →</Link>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Inbound</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{inboundMessages}</div>
            <div className="text-xs text-ink-500 mt-1">from customers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Outbound</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{outboundMessages}</div>
            <div className="text-xs text-ink-500 mt-1">from AI / you</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Active</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats._count.id}</div>
            <div className="text-xs text-ink-500 mt-1">conversations</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/inbox" className="p-4 border border-ink-100 rounded-lg hover:bg-ink-50 transition text-center">
            <MessageSquare className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="font-medium text-sm">Inbox</div>
            <div className="text-xs text-ink-500 mt-0.5">{stats._count.id} active</div>
          </Link>
          <Link href="/campaigns" className="p-4 border border-ink-100 rounded-lg hover:bg-ink-50 transition text-center">
            <Send className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="font-medium text-sm">Send broadcast</div>
            <div className="text-xs text-ink-500 mt-0.5">to all customers</div>
          </Link>
          <Link href="/templates" className="p-4 border border-ink-100 rounded-lg hover:bg-ink-50 transition text-center">
            <Sparkles className="w-8 h-8 text-purple-600 mx-auto mb-2" />
            <div className="font-medium text-sm">Templates</div>
            <div className="text-xs text-ink-500 mt-0.5">pre-approved</div>
          </Link>
          <Link href="/automation" className="p-4 border border-ink-100 rounded-lg hover:bg-ink-50 transition text-center">
            <Calendar className="w-8 h-8 text-amber-600 mx-auto mb-2" />
            <div className="font-medium text-sm">Automations</div>
            <div className="text-xs text-ink-500 mt-0.5">5 active flows</div>
          </Link>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentMessages.length === 0 ? (
            <div className="p-8 text-center text-ink-500 text-sm">No messages yet</div>
          ) : (
            <div className="divide-y divide-ink-100">
              {recentMessages.map((m) => (
                <div key={m.id} className="p-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${m.direction === 'inbound' ? 'bg-blue-500' : 'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink-900">
                      {m.conversation.customer?.name || 'Unknown'}
                      {m.sender === 'ai' && <Badge variant="success" className="ml-2 text-[10px]"><Sparkles className="w-3 h-3 mr-0.5" />AI</Badge>}
                    </div>
                    <div className="text-xs text-ink-600 truncate">{m.content}</div>
                  </div>
                  <div className="text-xs text-ink-500">{new Date(m.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle>Setup guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-ink-600">To enable real WhatsApp messaging, set these environment variables:</p>
          <pre className="p-3 bg-ink-50 rounded text-xs overflow-x-auto">
{`# Meta Cloud API (recommended, free tier)
WHATSAPP_PROVIDER="meta"
WHATSAPP_ACCESS_TOKEN="EAAxxx..."
WHATSAPP_PHONE_NUMBER_ID="1234567890"

# OR AiSensy (paid, easier)
WHATSAPP_PROVIDER="aisensy"
WHATSAPP_API_KEY="your-key"

# OR 360dialog (paid)
WHATSAPP_PROVIDER="360dialog"
WHATSAPP_API_KEY="your-key"`}
          </pre>
          <Link href="https://business.facebook.com/wa/manage/home" target="_blank" className="text-teal-600 text-sm flex items-center gap-1 hover:underline">
            Set up Meta WhatsApp Business <ExternalLink className="w-3 h-3" />
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
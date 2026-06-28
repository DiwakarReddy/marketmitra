import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mic, CheckCircle2, XCircle, AlertCircle, Sparkles, PhoneCall, PhoneOff, PhoneIncoming } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function VoiceChannelPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [business, recentCalls, allCalls, completedCalls] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.voiceCall.findMany({
      where: { businessId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.voiceCall.count({ where: { businessId } }),
    prisma.voiceCall.count({ where: { businessId, status: 'completed' } }),
  ])

  const totalDuration = await prisma.voiceCall.aggregate({
    where: { businessId, status: 'completed' },
    _sum: { durationSec: true },
  })
  const totalMin = Math.round((totalDuration._sum.durationSec || 0) / 60)

  const outcomes = await prisma.voiceCall.groupBy({
    by: ['outcome'],
    where: { businessId, outcome: { not: null } },
    _count: { id: true },
  })

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Phone className="w-7 h-7 text-purple-600" />
            Voice AI (Twilio)
          </h1>
          <p className="text-ink-600 mt-1">AI calls customers for reactivation, reminders, and follow-ups</p>
        </div>
        <Badge variant={business?.voiceConnected ? 'success' : 'secondary'} className="text-sm px-3 py-1.5">
          {business?.voiceConnected ? <><CheckCircle2 className="w-4 h-4 mr-1" />Connected</> : <><XCircle className="w-4 h-4 mr-1" />Not connected</>}
        </Badge>
      </div>

      {!business?.voiceConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-amber-900">Voice AI not connected</div>
                <div className="text-sm text-amber-800 mt-1">
                  Set Twilio credentials in your environment, then connect from Settings.
                </div>
                <pre className="mt-3 p-3 bg-white border border-amber-200 rounded text-xs">
{`TWILIO_ACCOUNT_SID="ACxxxxx"
TWILIO_AUTH_TOKEN="xxxxx"
TWILIO_PHONE_NUMBER="+91xxxxxxxxxx"`}
                </pre>
                <Link href="/settings" className="text-amber-700 underline mt-2 inline-block text-sm">Connect in Settings →</Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Total calls</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{allCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Completed</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{completedCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Total minutes</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{totalMin}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Cost saved</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">₹{Math.round(totalMin * 5)}</div>
            <div className="text-xs text-ink-500 mt-1">vs receptionist</div>
          </CardContent>
        </Card>
      </div>

      {/* Outcomes */}
      {outcomes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Call outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {outcomes.map((o) => (
                <div key={o.outcome} className="p-3 bg-ink-50 rounded-lg">
                  <div className="text-2xl font-bold text-ink-900">{o._count.id}</div>
                  <div className="text-xs text-ink-500 capitalize">{o.outcome?.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start a campaign */}
      <Card>
        <CardHeader>
          <CardTitle>Start a voice campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/campaigns" className="p-4 border border-ink-100 rounded-lg hover:bg-ink-50 transition flex items-center gap-3">
            <Mic className="w-8 h-8 text-purple-600" />
            <div className="flex-1">
              <div className="font-semibold">Create voice campaign</div>
              <div className="text-sm text-ink-500">AI calls inactive customers, books appointments</div>
            </div>
            <Sparkles className="w-5 h-5 text-ink-400" />
          </Link>
        </CardContent>
      </Card>

      {/* Recent calls */}
      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentCalls.length === 0 ? (
            <div className="p-8 text-center text-ink-500 text-sm">No calls yet</div>
          ) : (
            <div className="divide-y divide-ink-100">
              {recentCalls.map((c) => (
                <div key={c.id} className="p-3 flex items-center gap-3">
                  {c.status === 'completed' ? <PhoneCall className="w-5 h-5 text-green-600" /> : c.status === 'failed' ? <PhoneOff className="w-5 h-5 text-red-600" /> : <PhoneIncoming className="w-5 h-5 text-blue-600" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.customer.name}</div>
                    <div className="text-xs text-ink-500">
                      {c.durationSec > 0 ? `${Math.round(c.durationSec / 60)} min` : 'no answer'} • {c.outcome || c.status}
                    </div>
                  </div>
                  <div className="text-xs text-ink-500">{new Date(c.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
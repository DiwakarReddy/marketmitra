import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Receipt, FileText, AlertCircle, CheckCircle2, Clock, Zap, Sparkles, ArrowRight, KeyRound, Plug } from 'lucide-react'
import Link from 'next/link'
import { getPlanFeatures } from '@/lib/plan-features'
import { resolveChannel } from '@/lib/channel-resolver'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [business, invoices, failedInvoices] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.invoice.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    prisma.invoice.findMany({ where: { businessId, status: 'failed' } }),
  ])

  const currentPeriodStart = new Date()
  currentPeriodStart.setDate(1)
  currentPeriodStart.setHours(0, 0, 0, 0)

  const thisMonthBookings = await prisma.appointment.count({
    where: {
      businessId,
      status: { in: ['booked', 'completed', 'visited'] },
      createdAt: { gte: currentPeriodStart },
    },
  })

  const currentOwed = (thisMonthBookings * (business?.perBookingPaise || 20000))

  // AI quota — show usage + remaining for the current month
  const planFeatures = getPlanFeatures(business?.plan || 'trial')
  const aiIncluded = planFeatures.aiMessagesIncluded
  const aiUsed = business?.aiMessagesThisMonth || 0
  const aiRemaining = aiIncluded === null ? Infinity : Math.max(0, aiIncluded - aiUsed)
  const aiPercent = aiIncluded === null ? 0 : Math.min(100, Math.round((aiUsed / aiIncluded) * 100))

  // Which channels are connected?
  const connectedChannelConfigs = await prisma.channelConfig.findMany({
    where: { businessId, isActive: true },
    select: { channel: true, provider: true },
  })
  const connectedChannels = new Set(connectedChannelConfigs.map((c) => c.channel))

  // Does the business have its own AI key configured?
  const [openai, gemini] = await Promise.all([
    resolveChannel(businessId, 'openai'),
    resolveChannel(businessId, 'google_ai'),
  ])
  const hasOwnAiKey = !!openai?.credentials?.apiKey || !!gemini?.credentials?.apiKey

  const isSuspended = business?.plan === 'suspended'
  const hasFailedPayments = failedInvoices.length > 0

  const planLabel = planFeatures.label
  const isUnlimitedAi = aiIncluded === null

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      {/* Suspended banner */}
      {isSuspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-red-900">Account suspended</h2>
            <p className="text-sm text-red-700 mt-1">
              Your account is suspended due to failed payments. Update your payment method below to restore access.
            </p>
            {hasFailedPayments && (
              <p className="text-sm text-red-700 mt-1">
                {failedInvoices.length} failed invoice{failedInvoices.length > 1 ? 's' : ''} need attention.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-ink-900">Billing</h1>
        <p className="text-ink-600 mt-1">Per-booking pricing. No monthly fees on Growth plan.</p>
      </div>

      {/* Current plan + usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-600" />
            Current plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <Badge variant="default" className="mb-2">{planLabel.toUpperCase()}</Badge>
              <div className="text-2xl font-bold">
                ₹{((business?.perBookingPaise || 20000) / 100).toFixed(0)} <span className="text-base text-ink-500 font-normal">/ booking</span>
              </div>
              {business?.monthlyPricePaise ? (
                <div className="text-sm text-ink-500 mt-1">+ ₹{(business.monthlyPricePaise / 100).toLocaleString('en-IN')}/month</div>
              ) : (
                <div className="text-sm text-green-600 mt-1">✓ Pay per booking only</div>
              )}
              {business?.plan === 'scale' && (
                <div className="text-xs text-purple-700 mt-1">25% off per-booking rate</div>
              )}
              {business?.plan === 'enterprise' && (
                <div className="text-xs text-purple-700 mt-1">50% off + unlimited AI + dedicated CSM</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href="/plans">Change plan</Link></Button>
              <Button asChild variant="outline"><Link href="/settings">Payment method</Link></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Quota + Bring Your Own Key prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            AI usage this month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold text-ink-900">
              {aiUsed.toLocaleString('en-IN')}
              <span className="text-base text-ink-500 font-normal">
                {' '}/ {isUnlimitedAi ? 'Unlimited' : aiIncluded.toLocaleString('en-IN')} messages
              </span>
            </div>
            {!isUnlimitedAi && aiPercent > 80 && (
              <Badge variant={aiPercent >= 100 ? 'danger' : 'warning'}>
                {aiPercent >= 100 ? 'Limit reached' : `${aiPercent}% used`}
              </Badge>
            )}
            {isUnlimitedAi && (
              <Badge variant="success">Enterprise · No limits</Badge>
            )}
          </div>

          {!isUnlimitedAi && (
            <div className="w-full bg-ink-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  aiPercent >= 100 ? 'bg-red-500' : aiPercent > 80 ? 'bg-amber-500' : 'bg-teal-600'
                }`}
                style={{ width: `${aiPercent}%` }}
              />
            </div>
          )}

          {aiPercent >= 80 && !hasOwnAiKey && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <KeyRound className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900 text-sm">
                    {aiPercent >= 100 ? 'AI budget reached' : 'Approaching your AI limit'}
                  </div>
                  <p className="text-xs text-amber-800 mt-1">
                    Connect your own OpenAI or Google AI key — you pay them directly and we stop counting against your plan limit.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button asChild size="sm" variant="brand">
                      <Link href="/settings">Connect AI key <ArrowRight className="w-3 h-3 ml-1" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/plans">Upgrade plan</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasOwnAiKey && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-900">
                <strong>Own AI key connected</strong> — AI calls bypass your plan limit (you're paying {openai?.credentials?.apiKey ? 'OpenAI' : 'Google AI'} directly).
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5 text-blue-600" />
            Connected channels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['whatsapp', 'sms', 'email', 'voice', 'instagram', 'google_ads', 'google_calendar', 'razorpay'] as const).map((ch) => {
              const connected = connectedChannels.has(ch)
              const inPlan = (planFeatures.channels as readonly string[]).includes(ch)
              const labels: Record<string, string> = {
                whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', voice: 'Voice AI',
                instagram: 'Instagram', google_ads: 'Google Ads', google_calendar: 'Google Calendar', razorpay: 'Razorpay',
              }
              return (
                <div key={ch} className={`p-3 rounded-lg border ${connected ? 'border-green-200 bg-green-50/40' : 'border-ink-100'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{labels[ch]}</span>
                    {connected ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <span className="text-[10px] text-ink-400">
                        {inPlan ? 'Setup' : 'Upgrade'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500">
                    {connected ? 'Connected' : inPlan ? 'Not connected' : 'Not in plan'}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button asChild variant="outline">
              <Link href="/settings">Manage integrations <ArrowRight className="w-3 h-3 ml-1" /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* This month */}
      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wider">Bookings</div>
              <div className="text-2xl font-bold text-ink-900 mt-1">{thisMonthBookings}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wider">Rate</div>
              <div className="text-2xl font-bold text-ink-900 mt-1">₹{((business?.perBookingPaise || 20000) / 100).toFixed(0)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wider">Current due</div>
              <div className="text-2xl font-bold text-ink-900 mt-1">₹{(currentOwed / 100).toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wider">Next invoice</div>
              <div className="text-2xl font-bold text-ink-900 mt-1">1st of next month</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Failed payment alert */}
      {failedInvoices.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-red-900">{failedInvoices.length} failed payment{failedInvoices.length > 1 ? 's' : ''}</div>
              <div className="text-sm text-red-800 mt-1">
                Total ₹{(failedInvoices.reduce((s, i) => s + i.amountPaise, 0) / 100).toLocaleString('en-IN')} due. AI will retry automatically. Update payment method to avoid service interruption.
              </div>
              <Button size="sm" variant="destructive" className="mt-2" asChild>
                <Link href="/settings">Update payment</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice history */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No invoices yet</p>
              <p className="text-sm text-ink-500 mt-1">First invoice will be generated on the 1st of next month</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink-50 text-xs text-ink-500 uppercase">
                  <tr>
                    <th className="text-left p-3">Period</th>
                    <th className="text-right p-3">Bookings</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Issued</th>
                    <th className="text-right p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {invoices.map((inv) => {
                    const statusVariant: any = {
                      paid: 'success', pending: 'warning', failed: 'danger', refunded: 'secondary',
                    }
                    const statusIcon: any = {
                      paid: <CheckCircle2 className="w-3 h-3" />, pending: <Clock className="w-3 h-3" />, failed: <AlertCircle className="w-3 h-3" />,
                    }
                    return (
                      <tr key={inv.id}>
                        <td className="p-3 font-medium text-ink-900">
                          {new Date(inv.periodStart).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-3 text-right">{inv.bookings}</td>
                        <td className="p-3 text-right font-semibold text-ink-900">₹{(inv.amountPaise / 100).toLocaleString('en-IN')}</td>
                        <td className="p-3">
                          <Badge variant={statusVariant[inv.status] || 'secondary'}>
                            {statusIcon[inv.status]} {inv.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-ink-500 text-xs">{new Date(inv.createdAt).toLocaleDateString('en-IN')}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`/api/billing/invoice/${inv.id}/pdf`} target="_blank">
                              <Download className="w-3 h-3" />PDF
                            </a>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GST info — driven by real Business fields, editable in Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />GST & Tax</CardTitle>
        </CardHeader>
        <CardContent>
          {business?.gstin || business?.pan ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-ink-500">Your GSTIN</div>
                <div className="font-mono font-semibold">
                  {business.gstin || <span className="text-ink-400 italic">Not set</span>}
                </div>
              </div>
              <div>
                <div className="text-ink-500">Tax type</div>
                <div className="font-semibold">
                  {business.stateCode
                    ? `State ${business.stateCode} · ${business.taxScheme === 'composition' ? 'Composition scheme' : business.taxScheme === 'exempt' ? 'Exempt / unregistered' : 'Regular · 18% GST'}`
                    : 'Set state code in Settings'}
                </div>
              </div>
              <div>
                <div className="text-ink-500">HSN/SAC code</div>
                <div className="font-mono">
                  {business.hsnSac || <span className="text-ink-400 italic">Not set</span>}
                  {business.hsnSac === '998365' && ' (Marketing services)'}
                </div>
              </div>
              <div>
                <div className="text-ink-500">PAN</div>
                <div className="font-mono">
                  {business.pan || <span className="text-ink-400 italic">Not set</span>}
                </div>
              </div>
              {business.legalName && (
                <div className="md:col-span-2">
                  <div className="text-ink-500">Legal name</div>
                  <div className="font-semibold">{business.legalName}</div>
                </div>
              )}
              {business.billingAddress && (
                <div className="md:col-span-2">
                  <div className="text-ink-500">Billing address</div>
                  <div className="text-ink-700">
                    {business.billingAddress}
                    {business.billingCity && `, ${business.billingCity}`}
                    {business.billingState && `, ${business.billingState}`}
                    {business.billingPincode && ` - ${business.billingPincode}`}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-amber-900">GST details not set</div>
                  <p className="text-sm text-amber-800 mt-1">
                    Add your GSTIN, PAN and billing address in Settings so invoices are tax-compliant.
                    Without GSTIN, invoices show 18% IGST regardless of customer state.
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href="/settings">Add tax details</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-ink-500 mt-3">
            All invoices include CGST/SGST/IGST auto-detected by customer state. Download PDFs for your accountant.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
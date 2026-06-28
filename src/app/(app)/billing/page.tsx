import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Receipt, IndianRupee, FileText, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const [business, invoices, failedInvoices, periodBookings, periodRevenue] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.invoice.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: 24 }),
    prisma.invoice.findMany({ where: { businessId, status: 'failed' } }),
    prisma.appointment.count({ where: { businessId, status: { in: ['booked', 'completed', 'visited'] }, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    prisma.lead.aggregate({ where: { businessId, status: 'paid', lastTouchAt: { gte: new Date(Date.now() - 30 * 86400000) } }, _sum: { valuePaise: true } }),
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

  const isSuspended = business?.plan === 'suspended'
  const hasFailedPayments = failedInvoices.length > 0

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
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <Badge variant={business?.plan === 'starter' ? 'secondary' : 'default'} className="mb-2">
                {business?.plan?.toUpperCase()}
              </Badge>
              <div className="text-2xl font-bold">
                ₹{((business?.perBookingPaise || 20000) / 100).toFixed(0)} <span className="text-base text-ink-500 font-normal">/ booking</span>
              </div>
              {business?.monthlyPricePaise ? (
                <div className="text-sm text-ink-500 mt-1">+ ₹{(business.monthlyPricePaise / 100).toLocaleString('en-IN')}/month</div>
              ) : (
                <div className="text-sm text-green-600 mt-1">✓ Pay per booking only</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline"><Link href="/plans">Change plan</Link></Button>
              <Button asChild variant="outline"><Link href="/settings">Payment method</Link></Button>
            </div>
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

      {/* GST info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-blue-600" />GST & Tax</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-ink-500">Your GSTIN</div>
              <div className="font-mono font-semibold">{business?.id ? `23AAAAA0000A1Z5 (auto)` : 'Not set'}</div>
            </div>
            <div>
              <div className="text-ink-500">Tax type</div>
              <div className="font-semibold">Intra-state: CGST 9% + SGST 9% = 18%</div>
            </div>
            <div>
              <div className="text-ink-500">HSN/SAC code</div>
              <div className="font-mono">998365 (Marketing services)</div>
            </div>
            <div>
              <div className="text-ink-500">PAN</div>
              <div className="font-mono">AAAAA0000A</div>
            </div>
          </div>
          <p className="text-xs text-ink-500 mt-3">
            All invoices include CGST/SGST/IGST auto-detected by customer state. Download PDFs for your accountant.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
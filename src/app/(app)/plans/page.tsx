'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { PLANS, getPlan, type PlanTier } from '@/lib/plans'

export default function PlansPage() {
  const [currentPlan, setCurrentPlan] = useState<PlanTier>('starter')
  const [changing, setChanging] = useState<PlanTier | null>(null)
  const { toast } = useToast()

  const changePlan = async (planId: PlanTier) => {
    setChanging(planId)
    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentPlan(planId)
      toast({
        title: `Switched to ${getPlan(planId)?.name}! 🎉`,
        description: data.plan?.monthlyPaise ? `Now ₹${data.plan.monthlyPaise / 100}/month + ₹${data.plan.perBookingPaise / 100}/booking` : `Now ₹${data.plan.perBookingPaise / 100}/booking`,
        variant: 'success',
      })
    } catch (err: any) {
      toast({ title: 'Could not switch plan', description: err.message, variant: 'error' })
    } finally {
      setChanging(null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-ink-900">Choose your plan</h1>
        <p className="text-ink-600 mt-1">Upgrade or downgrade anytime. Pay only for what you use.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const isHighlighted = plan.highlighted
          return (
            <Card
              key={plan.id}
              className={`relative overflow-hidden ${isHighlighted ? 'border-2 border-teal-500 shadow-xl' : ''}`}
            >
              {isHighlighted && (
                <div className="absolute -top-1 left-0 right-0 bg-gradient-to-r from-teal-600 to-teal-500 text-white text-center text-xs font-bold uppercase tracking-wider py-1.5">
                  ⭐ Most Popular
                </div>
              )}
              <CardContent className={`p-6 ${isHighlighted ? 'pt-10' : ''}`}>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xl font-bold text-ink-900">{plan.name}</h3>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                  </div>
                  <p className="text-sm text-ink-500">{plan.tagline}</p>
                </div>

                <div className="mb-5">
                  {plan.monthlyPaise ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-ink-900">₹{(plan.monthlyPaise / 100).toLocaleString('en-IN')}</span>
                        <span className="text-ink-500">/mo</span>
                      </div>
                      <div className="text-sm text-ink-600 mt-1">+ ₹{(plan.perBookingPaise / 100).toFixed(0)} per booking</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-ink-900">₹{(plan.perBookingPaise / 100).toFixed(0)}</span>
                        <span className="text-ink-500">/booking</span>
                      </div>
                      <div className="text-sm text-ink-600 mt-1">No monthly fee. Pay only for results.</div>
                    </>
                  )}
                </div>

                <div className="space-y-2 mb-6">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-sm text-ink-700">
                      <Check className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <Button
                  variant={isHighlighted ? 'brand' : isCurrent ? 'outline' : 'outline'}
                  className="w-full"
                  disabled={isCurrent || changing === plan.id}
                  onClick={() => changePlan(plan.id)}
                >
                  {changing === plan.id ? (
                    'Switching...'
                  ) : isCurrent ? (
                    'Current plan'
                  ) : (
                    <>
                      {plan.id === 'starter' && 'Downgrade to Starter'}
                      {plan.id === 'growth' && 'Switch to Growth'}
                      {plan.id === 'scale' && (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Upgrade to Scale
                        </>
                      )}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feature comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200">
                  <th className="text-left p-4 font-semibold">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="text-center p-4 font-semibold">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    category: 'Channels',
                    features: [
                      { name: 'WhatsApp AI inbox', values: ['✓', '✓', '✓'] },
                      { name: 'Reactivation broadcasts', values: ['✓', '✓', '✓'] },
                      { name: 'Voice AI calls', values: ['—', '✓', '✓'] },
                      { name: 'Instagram content', values: ['—', '✓', '✓'] },
                      { name: 'Google Ads automation', values: ['—', '✓', '✓'] },
                      { name: 'Email automation', values: ['—', '✓', '✓'] },
                    ],
                  },
                  {
                    category: 'Capacity',
                    features: [
                      { name: 'Customers', values: ['1,000', 'Unlimited', 'Unlimited'] },
                      { name: 'Campaigns / month', values: ['20', 'Unlimited', 'Unlimited'] },
                      { name: 'Team members', values: ['1', '5', 'Unlimited'] },
                      { name: 'Locations', values: ['1', '1', 'Unlimited'] },
                    ],
                  },
                  {
                    category: 'Support',
                    features: [
                      { name: 'Email support', values: ['✓', '✓', '✓'] },
                      { name: 'Priority support', values: ['—', '✓', '✓'] },
                      { name: 'Dedicated success manager', values: ['—', '—', '✓'] },
                      { name: 'SLA', values: ['48h', '24h', '4h'] },
                    ],
                  },
                ].map((section) => (
                  <>
                    <tr key={section.category} className="bg-ink-50">
                      <td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink-500">
                        {section.category}
                      </td>
                    </tr>
                    {section.features.map((f) => (
                      <tr key={f.name} className="border-b border-ink-100">
                        <td className="p-4">{f.name}</td>
                        {f.values.map((v, idx) => (
                          <td key={idx} className="text-center p-4 text-ink-600">
                            {v === '✓' ? <Check className="w-4 h-4 text-teal-600 mx-auto" /> : v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why outcome-based pricing?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-ink-700 space-y-2">
          <p>
            <strong>Most tools charge by seat.</strong> You're forced to pay full price even when business is slow. We don't.
          </p>
          <p>
            <strong>MarketMitra charges per booking AI delivers.</strong> If we don't get you customers, you don't pay for "AI marketing" — only for actual bookings.
          </p>
          <p className="text-ink-500 italic">
            Average customer gets 30-80 bookings/month → ₹6K-16K MRR. Most profitable customers are on the Growth plan.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
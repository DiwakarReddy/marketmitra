'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Plus, Sparkles, Calendar, X, Loader2, MessageSquare, Mic, Image as ImageIcon, TrendingUp, Send, Eye, Users, IndianRupee, BarChart3, FlaskConical, Megaphone } from 'lucide-react'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  channels: string
  audience: string | null
  messageBody: string | null
  budgetPaise: number
  spentPaise?: number
  leads: number
  bookings: number
  revenuePaise: number
  scheduledFor: Date | null
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
}

const TYPE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  reactivation: { label: 'Reactivation', icon: Sparkles, color: 'bg-purple-100 text-purple-700' },
  broadcast: { label: 'Broadcast', icon: MessageSquare, color: 'bg-blue-100 text-blue-700' },
  voice: { label: 'Voice AI', icon: Mic, color: 'bg-indigo-100 text-indigo-700' },
  instagram: { label: 'Instagram', icon: ImageIcon, color: 'bg-pink-100 text-pink-700' },
  google_ads: { label: 'Google Ads', icon: TrendingUp, color: 'bg-green-100 text-green-700' },
  festival: { label: 'Festival', icon: Sparkles, color: 'bg-amber-100 text-amber-700' },
  birthday: { label: 'Birthday', icon: Sparkles, color: 'bg-pink-100 text-pink-700' },
  review: { label: 'Review', icon: Sparkles, color: 'bg-yellow-100 text-yellow-700' },
}

const STATUS_VARIANT: Record<string, any> = {
  draft: 'secondary',
  scheduled: 'warning',
  running: 'default',
  completed: 'success',
  paused: 'outline',
  failed: 'danger',
}

export function CampaignsClient({ initialCampaigns }: { initialCampaigns: Campaign[] }) {
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState(initialCampaigns)
  const [creating, setCreating] = useState(false)
  const [view, setView] = useState<'list' | 'ab-test'>('list')

  const stats = {
    total: campaigns.length,
    running: campaigns.filter((c) => c.status === 'running').length,
    leads: campaigns.reduce((s, c) => s + c.leads, 0),
    bookings: campaigns.reduce((s, c) => s + c.bookings, 0),
    revenue: campaigns.reduce((s, c) => s + c.revenuePaise, 0),
    spend: campaigns.reduce((s, c) => s + (c.spentPaise || 0), 0),
  }

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Campaigns</h1>
          <p className="text-ink-600 mt-1">{stats.total} campaigns • {stats.running} running</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border border-ink-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-teal-600 text-white' : 'bg-white text-ink-700'}`}
            >
              <Megaphone className="w-3 h-3 inline mr-1" />All
            </button>
            <button
              onClick={() => setView('ab-test')}
              className={`px-3 py-1.5 text-xs font-medium ${view === 'ab-test' ? 'bg-teal-600 text-white' : 'bg-white text-ink-700'}`}
            >
              <FlaskConical className="w-3 h-3 inline mr-1" />A/B Tests
            </button>
          </div>
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />New campaign
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Leads" value={stats.leads} icon={Users} color="blue" />
        <StatCard label="Bookings" value={stats.bookings} icon={Calendar} color="teal" />
        <StatCard label="Revenue" value={`₹${(stats.revenue / 100).toLocaleString('en-IN')}`} icon={IndianRupee} color="green" />
        <StatCard label="Ad spend" value={`₹${(stats.spend / 100).toLocaleString('en-IN')}`} icon={TrendingUp} color="amber" />
        <StatCard label="ROAS" value={stats.spend > 0 ? `${(stats.revenue / stats.spend).toFixed(2)}x` : '—'} icon={BarChart3} color="purple" />
      </div>

      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            {campaigns.length === 0 ? (
              <div className="p-12 text-center">
                <Megaphone className="w-12 h-12 text-ink-300 mx-auto mb-3" />
                <p className="text-ink-700 font-medium">No campaigns yet</p>
                <p className="text-sm text-ink-500 mt-1 mb-4">Create your first campaign to start reaching customers</p>
                <Button variant="brand" onClick={() => setCreating(true)}>
                  <Plus className="w-4 h-4" />Create campaign
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-ink-100">
                {campaigns.map((c) => {
                  const typeInfo = TYPE_LABELS[c.type] || TYPE_LABELS.broadcast
                  const Icon = typeInfo.icon
                  return (
                    <div key={c.id} className="p-4 hover:bg-ink-50/50">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeInfo.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-ink-900">{c.name}</h3>
                            <Badge variant={STATUS_VARIANT[c.status] || 'secondary'}>{c.status}</Badge>
                            {c.scheduledFor && <Badge variant="warning">⏰ {new Date(c.scheduledFor).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</Badge>}
                          </div>
                          {c.messageBody && (
                            <p className="text-sm text-ink-600 mt-1 line-clamp-2">{c.messageBody}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs">
                            <span className="text-ink-500">📊 {c.leads} leads</span>
                            <span className="text-ink-500">📅 {c.bookings} bookings</span>
                            <span className="text-ink-500">💰 ₹{(c.revenuePaise / 100).toLocaleString('en-IN')}</span>
                            <span className="text-ink-500">📢 {c.channels}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost"><Eye className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === 'ab-test' && <ABTestView campaigns={campaigns} />}

      {creating && (
        <CampaignCreateModal
          onClose={() => setCreating(false)}
          onCreate={(newCampaign) => {
            setCampaigns([newCampaign, ...campaigns])
            setCreating(false)
            toast({ title: 'Campaign created', variant: 'success' })
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    teal: 'bg-teal-100 text-teal-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
  }
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-ink-900">{value}</div>
            <div className="text-xs text-ink-500">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ABTestView({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FlaskConical className="w-5 h-5 text-purple-600" />A/B Tests</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-ink-600 space-y-2">
          <p>Test different versions of the same campaign to find the winner.</p>
          <p className="text-xs text-ink-500">A/B tests are automatically created when you mark a campaign as &quot;Run A/B test&quot; in the campaign creator.</p>
        </div>
        <div className="mt-4 p-8 text-center border-2 border-dashed border-ink-200 rounded-lg">
          <FlaskConical className="w-8 h-8 text-ink-300 mx-auto mb-2" />
          <p className="text-sm text-ink-500">No active A/B tests</p>
          <p className="text-xs text-ink-400 mt-1">Create a campaign with A/B test enabled to start</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (c: Campaign) => void }) {
  const { toast } = useToast()
  const [step, setStep] = useState<'type' | 'message' | 'audience' | 'schedule'>('type')
  const [form, setForm] = useState({
    name: '',
    type: 'broadcast',
    channels: 'whatsapp',
    audience: 'all',
    messageBody: '',
    budget: 5000,
    runABTest: false,
    variantB: '',
    scheduledFor: '',
  })
  const [generating, setGenerating] = useState(false)

  const generateMessage = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt: `You are a marketing expert writing WhatsApp messages for a small Indian business. The business is a ${form.type === 'broadcast' ? 'service business' : form.type} targeting the ${form.audience} audience. Write in Hinglish (mix of Hindi and English). Keep under 100 words. Use 1-2 emojis maximum. End with a call to action.`,
          userMessage: `Write a campaign message for type "${form.type}" targeting audience "${form.audience}".`,
        }),
      })
      const data = await res.json()
      if (data.text) {
        setForm({ ...form, messageBody: data.text })
        toast({ title: 'AI message generated', variant: 'success' })
      }
    } catch (err) {
      // Mock fallback
      setForm({ ...form, messageBody: `${form.audience} के लिए special offer! 🎉\n\nVisit us this week and get 20% off your ${form.type}. Reply YES to book.\n\n— MarketMitra` })
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        budgetPaise: form.budget * 100,
        scheduledFor: form.scheduledFor || null,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      onCreate(data.campaign)
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold">New campaign</h2>
            <div className="text-xs text-ink-500 mt-1 flex items-center gap-2">
              {['type', 'message', 'audience', 'schedule'].map((s, i) => (
                <span key={s} className={step === s ? 'text-teal-700 font-semibold' : ''}>
                  {i + 1}. {s}
                </span>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'type' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Campaign name</label>
                <Input
                  placeholder="e.g. Diwali Smile Special"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Type</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => {
                    const Icon = v.icon
                    return (
                      <button
                        key={k}
                        onClick={() => setForm({ ...form, type: k })}
                        className={`p-3 border-2 rounded-lg text-left ${form.type === k ? 'border-teal-500 bg-teal-50' : 'border-ink-200'}`}
                      >
                        <Icon className={`w-5 h-5 mb-1 ${form.type === k ? 'text-teal-700' : 'text-ink-500'}`} />
                        <div className="text-sm font-medium">{v.label}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Channel</label>
                <select
                  className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                  value={form.channels}
                  onChange={(e) => setForm({ ...form, channels: e.target.value })}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="voice">Voice AI</option>
                  <option value="instagram">Instagram</option>
                  <option value="google_ads">Google Ads</option>
                  <option value="email">Email</option>
                  <option value="all">All channels</option>
                </select>
              </div>
            </>
          )}

          {step === 'message' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Message</label>
                <textarea
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[150px]"
                  value={form.messageBody}
                  onChange={(e) => setForm({ ...form, messageBody: e.target.value })}
                  placeholder="Write your message in Hinglish, Hindi, or English..."
                />
                <Button size="sm" variant="outline" onClick={generateMessage} disabled={generating} className="mt-2">
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {generating ? 'Generating...' : 'Generate with AI'}
                </Button>
              </div>
              <div className="flex items-center gap-2 p-3 bg-ink-50 rounded-lg">
                <input
                  type="checkbox"
                  id="abtest"
                  checked={form.runABTest}
                  onChange={(e) => setForm({ ...form, runABTest: e.target.checked })}
                />
                <label htmlFor="abtest" className="text-sm">Run A/B test with a variant</label>
              </div>
              {form.runABTest && (
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Variant B</label>
                  <textarea
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[100px]"
                    value={form.variantB}
                    onChange={(e) => setForm({ ...form, variantB: e.target.value })}
                    placeholder="Alternative version of the message..."
                  />
                </div>
              )}
            </>
          )}

          {step === 'audience' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Audience</label>
                <select
                  className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                  value={form.audience}
                  onChange={(e) => setForm({ ...form, audience: e.target.value })}
                >
                  <option value="all">All customers</option>
                  <option value="vip">VIPs (10+ visits)</option>
                  <option value="inactive">Inactive (90+ days)</option>
                  <option value="new">New customers (1 visit)</option>
                  <option value="tag:vip">Tag: vip</option>
                  <option value="birthday_this_month">Birthday this month</option>
                  <option value="anniversary_this_month">Anniversary this month</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Budget (₹)</label>
                <Input
                  type="number"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: parseInt(e.target.value) })}
                />
                <p className="text-xs text-ink-500 mt-1">For paid channels (Google Ads, Instagram ads). Free for WhatsApp/voice.</p>
              </div>
            </>
          )}

          {step === 'schedule' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">When to send?</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setForm({ ...form, scheduledFor: '' })}
                    className={`w-full p-3 border-2 rounded-lg text-left ${!form.scheduledFor ? 'border-teal-500 bg-teal-50' : 'border-ink-200'}`}
                  >
                    <Send className="w-4 h-4 inline mr-2" />Send now
                  </button>
                  <button
                    onClick={() => setForm({ ...form, scheduledFor: new Date(Date.now() + 86400000).toISOString().slice(0, 16) })}
                    className={`w-full p-3 border-2 rounded-lg text-left ${form.scheduledFor ? 'border-teal-500 bg-teal-50' : 'border-ink-200'}`}
                  >
                    <Calendar className="w-4 h-4 inline mr-2" />Schedule for later
                  </button>
                </div>
              </div>
              {form.scheduledFor && (
                <Input
                  type="datetime-local"
                  value={typeof form.scheduledFor === 'string' ? form.scheduledFor : ''}
                  onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                />
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-ink-100 flex justify-between">
          <Button variant="outline" onClick={() => {
            const steps = ['type', 'message', 'audience', 'schedule'] as const
            const idx = steps.indexOf(step)
            if (idx > 0) setStep(steps[idx - 1])
            else onClose()
          }}>Back</Button>
          {step !== 'schedule' ? (
            <Button variant="brand" onClick={() => {
              const steps = ['type', 'message', 'audience', 'schedule'] as const
              const idx = steps.indexOf(step)
              setStep(steps[idx + 1])
            }}>Next</Button>
          ) : (
            <Button variant="brand" onClick={save}><Send className="w-4 h-4" />{form.scheduledFor ? 'Schedule' : 'Send now'}</Button>
          )}
        </div>
      </div>
    </div>
  )
}
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Plus, Sparkles, Calendar, X, Loader2, MessageSquare, Mic, Image as ImageIcon, TrendingUp, Send, Eye, Users, IndianRupee, BarChart3, FlaskConical, Megaphone, Trash2, Info, Edit3 } from 'lucide-react'

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
  const [viewing, setViewing] = useState<Campaign | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

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
                          <div className="flex items-center gap-4 mt-2 text-xs flex-wrap">
                            <span className="text-ink-500">📊 {c.leads} leads</span>
                            <span className="text-ink-500">📅 {c.bookings} bookings</span>
                            <span className="text-ink-500">💰 ₹{(c.revenuePaise / 100).toLocaleString('en-IN')}</span>
                            <span className="text-ink-500">📢 {c.channels}</span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {(c.status === 'draft' || c.status === 'scheduled') && (
                            <Button
                              size="sm"
                              variant="brand"
                              onClick={() => sendNow(c.id)}
                              disabled={sendingId === c.id}
                            >
                              {sendingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                              Send
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setViewing(c)} title="View details">
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteCampaign(c)} title="Delete">
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
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

      {viewing && (
        <CampaignDetailModal
          campaign={viewing}
          onClose={() => setViewing(null)}
          onUpdated={(updated) => {
            setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)))
            setViewing(updated)
          }}
          onDeleted={() => {
            setCampaigns(campaigns.filter((c) => c.id !== viewing.id))
            setViewing(null)
          }}
          onSent={(updated) => {
            setCampaigns(campaigns.map((c) => (c.id === updated.id ? updated : c)))
            setViewing(updated)
          }}
        />
      )}
    </div>
  )

  async function sendNow(id: string) {
    setSendingId(id)
    try {
      const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      const updated: Campaign = {
        ...campaigns.find((c) => c.id === id)!,
        ...data.campaign,
      }
      setCampaigns(campaigns.map((c) => (c.id === id ? updated : c)))
      toast({
        title: `Sent to ${data.sent} customer${data.sent === 1 ? '' : 's'}`,
        description: data.failed ? `${data.failed} failed` : undefined,
        variant: data.failed > 0 ? 'warning' as any : 'success',
      })
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'error' })
    } finally {
      setSendingId(null)
    }
  }

  async function deleteCampaign(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setCampaigns(campaigns.filter((x) => x.id !== c.id))
      toast({ title: 'Campaign deleted', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'error' })
    }
  }
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
    topic: '',          // What the campaign is about (e.g., "review after hospital visit")
    messageBody: '',
    budget: 5000,
    runABTest: false,
    variantB: '',
    scheduledFor: '',
  })
  const [generating, setGenerating] = useState(false)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null) // null = unknown
  const [showTypeHelp, setShowTypeHelp] = useState(false)
  const [showChannelHelp, setShowChannelHelp] = useState(false)

  const generateMessage = async () => {
    setGenerating(true)
    try {
      const topicLine = form.topic
        ? `Topic: ${form.topic}`
        : ''
      const audienceLabel = form.audience === 'all'
        ? 'all customers'
        : form.audience.startsWith('tag:')
          ? `customers tagged "${form.audience.slice(4)}"`
          : form.audience.replace(/_/g, ' ')
      const systemPrompt = `You are a marketing copywriter for a small Indian business on WhatsApp. Write messages in Hinglish (Hindi + English mix, like real Indian small-business owners speak). Keep under 100 words. Use 1-2 emojis max. Always end with a clear call-to-action (reply YES, call now, or book link). Be warm and specific. Don't invent prices, dates, or services you're not told about.`
      const userMessage = `Write a WhatsApp campaign message.
Campaign type: ${form.type}
Target audience: ${audienceLabel}
${topicLine}

Make it feel personal and conversational, not generic.`

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, userMessage }),
      })
      const data = await res.json()
      if (data.text) {
        setForm({ ...form, messageBody: data.text })
        if (data.aiAvailable === false) {
          // API itself told us AI isn't configured
          setAiAvailable(false)
          toast({
            title: 'AI not configured — using template',
            description: 'Add your OpenAI or Google AI key in Settings → Integrations to enable real AI generation.',
            variant: 'default',
          })
        } else {
          setAiAvailable(true)
          toast({ title: 'AI message generated ✨', variant: 'success' })
        }
      } else {
        throw new Error('No text returned')
      }
    } catch (err: any) {
      // Show a more useful fallback that's actually editable
      const topic = form.topic || `${form.type} message`
      setForm({
        ...form,
        messageBody: `🙏 नमस्ते! ${topic} के बारे में update है।

हम आपके लिए कुछ special लेकर आए हैं। जवाब दें तो हम details share करें।

— MarketMitra`,
      })
      toast({
        title: 'AI unavailable — using starter template',
        description: 'Edit the message above or add an AI key in Settings → Integrations.',
        variant: 'default',
      })
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    // Final validation guard (server validates too, but fail fast with a clear message)
    if (!form.name.trim()) {
      toast({ title: 'Campaign name is required', variant: 'error' })
      setStep('type')
      return
    }
    if (!form.messageBody.trim()) {
      toast({ title: 'Message is required — write something or generate with AI', variant: 'error' })
      setStep('message')
      return
    }
    if (!form.audience) {
      toast({ title: 'Select an audience', variant: 'error' })
      setStep('audience')
      return
    }

    const wantToSendNow = !form.scheduledFor
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        budgetPaise: form.budget * 100,
        scheduledFor: form.scheduledFor || null,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast({ title: err.error || 'Could not save campaign', variant: 'error' })
      return
    }
    const data = await res.json()
    const created: Campaign = data.campaign

    if (wantToSendNow) {
      // Immediately send — don't leave it stuck in draft
      setGenerating(true) // reuse as "in progress"
      try {
        const sendRes = await fetch(`/api/campaigns/${created.id}/send`, { method: 'POST' })
        const sendData = await sendRes.json()
        if (!sendRes.ok) throw new Error(sendData.error || 'Send failed')
        const sent = sendData.campaign || { ...created, status: 'completed', leads: sendData.total || 0 }
        onCreate(sent)
        toast({
          title: `Campaign sent to ${sendData.sent || 0} customer${sendData.sent === 1 ? '' : 's'}! 🚀`,
          description: sendData.failed ? `${sendData.failed} failed` : undefined,
          variant: sendData.failed ? 'warning' as any : 'success',
        })
      } catch (err: any) {
        // Campaign was saved but send failed — show it as draft so user can retry
        onCreate(created)
        toast({ title: 'Campaign saved as draft', description: 'Send failed: ' + err.message, variant: 'error' })
      } finally {
        setGenerating(false)
      }
    } else {
      onCreate(created)
      toast({ title: 'Campaign scheduled', variant: 'success' })
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
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">
                  Campaign name <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Diwali Smile Special"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={!form.name.trim() ? 'border-ink-200' : ''}
                />
                {!form.name.trim() && (
                  <p className="text-xs text-amber-600 mt-1">Required — pick something you'll recognize in the list.</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink-600 block">
                    Type <span className="text-ink-400">(what kind of campaign)</span>
                  </label>
                  <button
                    onClick={() => setShowTypeHelp(!showTypeHelp)}
                    className="text-[10px] text-teal-700 hover:underline flex items-center gap-1"
                  >
                    <Info className="w-3 h-3" /> {showTypeHelp ? 'hide' : 'explain'}
                  </button>
                </div>
                {showTypeHelp && (
                  <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                    <p><strong>Type</strong> = the <em>purpose</em> of the campaign.</p>
                    <p>• <strong>Reactivation</strong> — re-engage past customers who haven't visited in 90+ days.</p>
                    <p>• <strong>Birthday / Anniversary</strong> — auto-send wishes on customer's special day with an offer.</p>
                    <p>• <strong>Festival</strong> — pre-loaded greetings for Diwali, Holi, Eid, etc.</p>
                    <p>• <strong>Review request</strong> — ask satisfied customers to leave a Google review.</p>
                    <p>• <strong>Broadcast</strong> — one-off message to any audience.</p>
                    <p>• <strong>Voice AI / Instagram / Google Ads</strong> — run on those specific channels.</p>
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => {
                    const Icon = v.icon
                    return (
                      <button
                        key={k}
                        onClick={() => setForm({ ...form, type: k })}
                        className={`p-3 border-2 rounded-lg text-left ${form.type === k ? 'border-teal-500 bg-teal-50' : 'border-ink-200 hover:border-ink-300'}`}
                      >
                        <Icon className={`w-5 h-5 mb-1 ${form.type === k ? 'text-teal-700' : 'text-ink-500'}`} />
                        <div className="text-sm font-medium">{v.label}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink-600 block">
                    Channel <span className="text-ink-400">(where to send it)</span>
                  </label>
                  <button
                    onClick={() => setShowChannelHelp(!showChannelHelp)}
                    className="text-[10px] text-teal-700 hover:underline flex items-center gap-1"
                  >
                    <Info className="w-3 h-3" /> {showChannelHelp ? 'hide' : 'explain'}
                  </button>
                </div>
                {showChannelHelp && (
                  <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                    <p><strong>Channel</strong> = the <em>delivery medium</em>.</p>
                    <p>• <strong>WhatsApp</strong> — text + template messages, 95% open rate. Default.</p>
                    <p>• <strong>Voice AI</strong> — outbound AI phone calls (Twilio). Good for reactivation.</p>
                    <p>• <strong>Instagram</strong> — DMs and posts via Instagram Graph API.</p>
                    <p>• <strong>Google Ads</strong> — paid search/display ads (uses your budget).</p>
                    <p>• <strong>Email</strong> — transactional emails (Resend).</p>
                    <p className="pt-1 border-t border-blue-200 mt-1">💡 Pick WhatsApp for first-time campaigns — highest ROI.</p>
                  </div>
                )}
                <select
                  className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                  value={form.channels}
                  onChange={(e) => setForm({ ...form, channels: e.target.value })}
                >
                  <option value="whatsapp">WhatsApp — Recommended</option>
                  <option value="voice">Voice AI (phone calls)</option>
                  <option value="instagram">Instagram DMs</option>
                  <option value="google_ads">Google Ads (paid)</option>
                  <option value="email">Email</option>
                  <option value="all">All configured channels</option>
                </select>
              </div>
            </>
          )}

          {step === 'message' && (
            <>
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">
                  What's this campaign about?
                </label>
                <Input
                  placeholder="e.g. recent hospital visit review, Diwali offer, monsoon checkup"
                  value={form.topic}
                  onChange={(e) => setForm({ ...form, topic: e.target.value })}
                />
                <p className="text-xs text-ink-500 mt-1">
                  Be specific. The AI uses this to write a personal, contextual message — not a generic template.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink-600 block">
                    Message <span className="text-red-500">*</span>
                  </label>
                  {aiAvailable === false && (
                    <span className="text-[10px] text-amber-700">⚠️ AI not configured — add key in Settings</span>
                  )}
                </div>
                <textarea
                  className={`w-full rounded-lg border px-3 py-2 text-sm min-h-[150px] ${
                    !form.messageBody.trim() ? 'border-ink-200' : 'border-ink-200'
                  }`}
                  value={form.messageBody}
                  onChange={(e) => setForm({ ...form, messageBody: e.target.value })}
                  placeholder="Write your message in Hinglish, Hindi, or English — or click 'Generate with AI' below."
                />
                {!form.messageBody.trim() && (
                  <p className="text-xs text-amber-600 mt-1">Required — write a message or use AI to generate one.</p>
                )}
                <Button size="sm" variant="outline" onClick={generateMessage} disabled={generating || !form.topic} className="mt-2">
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {generating ? 'Generating...' : 'Generate with AI'}
                </Button>
                {!form.topic && (
                  <p className="text-xs text-ink-500 mt-1">Add a topic above to enable AI generation</p>
                )}
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
              // Validate before advancing
              if (step === 'type' && !form.name.trim()) {
                toast({ title: 'Enter a campaign name first', variant: 'error' })
                return
              }
              if (step === 'message' && !form.messageBody.trim()) {
                toast({ title: 'Write or generate a message first', variant: 'error' })
                return
              }
              const steps = ['type', 'message', 'audience', 'schedule'] as const
              const idx = steps.indexOf(step)
              setStep(steps[idx + 1])
            }}>Next</Button>
          ) : (
            <Button variant="brand" onClick={save} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {generating
                ? 'Sending…'
                : form.scheduledFor
                  ? 'Schedule for later'
                  : 'Send now'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function CampaignDetailModal({
  campaign,
  onClose,
  onUpdated,
  onDeleted,
  onSent,
}: {
  campaign: Campaign
  onClose: () => void
  onUpdated: (c: Campaign) => void
  onDeleted: () => void
  onSent: (c: Campaign) => void
}) {
  const { toast } = useToast()
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({
    name: campaign.name,
    messageBody: campaign.messageBody || '',
    status: campaign.status,
    scheduledFor: campaign.scheduledFor ? new Date(campaign.scheduledFor).toISOString().slice(0, 16) : '',
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          messageBody: form.messageBody,
          status: form.status,
          scheduledFor: form.scheduledFor || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      onUpdated(data.campaign)
      setEdit(false)
      toast({ title: 'Campaign updated', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      onSent(data.campaign)
      toast({
        title: `Sent to ${data.sent} customer${data.sent === 1 ? '' : 's'}`,
        description: data.failed ? `${data.failed} failed` : undefined,
        variant: data.failed > 0 ? 'warning' as any : 'success',
      })
    } catch (err: any) {
      toast({ title: 'Send failed', description: err.message, variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this campaign?')) return
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      onDeleted()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'error' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold">{edit ? 'Edit campaign' : campaign.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={STATUS_VARIANT[campaign.status] || 'secondary'}>{campaign.status}</Badge>
              <Badge variant="outline" className="text-xs">{campaign.type}</Badge>
              <Badge variant="outline" className="text-xs">{campaign.channels}</Badge>
            </div>
          </div>
          <div className="flex gap-1">
            {!edit && (
              <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
                <Edit3 className="w-3 h-3" /> Edit
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {edit ? (
            <>
              <div>
                <label className="text-xs font-medium text-ink-700 mb-1.5 block">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700 mb-1.5 block">Message</label>
                <textarea
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[150px]"
                  value={form.messageBody}
                  onChange={(e) => setForm({ ...form, messageBody: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">Status</label>
                  <select
                    className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">Scheduled for</label>
                  <Input
                    type="datetime-local"
                    value={form.scheduledFor}
                    onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {campaign.messageBody && (
                <div>
                  <div className="text-xs font-medium text-ink-700 mb-1.5">Message</div>
                  <div className="p-3 bg-ink-50 rounded-lg text-sm text-ink-800 whitespace-pre-wrap">{campaign.messageBody}</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-ink-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-ink-900">{campaign.leads}</div>
                  <div className="text-xs text-ink-500">Leads</div>
                </div>
                <div className="p-3 bg-ink-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-ink-900">{campaign.bookings}</div>
                  <div className="text-xs text-ink-500">Bookings</div>
                </div>
                <div className="p-3 bg-ink-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-ink-900">₹{(campaign.revenuePaise / 100).toLocaleString('en-IN')}</div>
                  <div className="text-xs text-ink-500">Revenue</div>
                </div>
              </div>
              <div className="text-xs text-ink-500 space-y-1">
                {campaign.scheduledFor && <div>⏰ Scheduled: {new Date(campaign.scheduledFor).toLocaleString('en-IN')}</div>}
                {campaign.startedAt && <div>▶️ Started: {new Date(campaign.startedAt).toLocaleString('en-IN')}</div>}
                {campaign.endedAt && <div>⏹️ Ended: {new Date(campaign.endedAt).toLocaleString('en-IN')}</div>}
                <div>📅 Created: {new Date(campaign.createdAt).toLocaleString('en-IN')}</div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-ink-100 flex justify-between">
          <Button variant="outline" onClick={remove} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="w-3 h-3" /> Delete
          </Button>
          <div className="flex gap-2">
            {edit ? (
              <>
                <Button variant="outline" onClick={() => setEdit(false)}>Cancel</Button>
                <Button variant="brand" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </Button>
              </>
            ) : (campaign.status === 'draft' || campaign.status === 'scheduled') && (
              <Button variant="brand" onClick={send} disabled={sending}>
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Send now
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
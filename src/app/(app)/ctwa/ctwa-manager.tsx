// CTWA Ads — Click-to-WhatsApp Ads manager

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/confirm-dialog'
import {
  Megaphone, Plus, Trash2, Edit3, Play, Pause, Eye, MousePointerClick,
  DollarSign, Users, Loader2, X, Save, ExternalLink, TrendingUp, RefreshCw,
  AlertCircle, CheckCircle2, Target
} from 'lucide-react'

interface CTWACampaign {
  id: string
  name: string
  status: 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected'
  phoneNumber: string
  welcomeMessage: string | null
  adHeadline: string
  adBody: string
  adImageUrl: string | null
  budgetDailyPaise: number
  spentPaise: number
  impressions: number
  clicks: number
  leads: number
  metaAdId: string | null
  metaCampaignId: string | null
  lastSyncedAt: string | null
  createdAt: string
}

export function CTWAManager() {
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const [campaigns, setCampaigns] = useState<CTWACampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ctwa/campaigns')
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } finally { setLoading(false) }
  }

  const toggleStatus = async (c: CTWACampaign) => {
    const newStatus = c.status === 'active' ? 'paused' : 'active'
    try {
      await fetch(`/api/ctwa/campaigns/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      toast({ title: newStatus === 'active' ? 'Activated in Meta' : 'Paused in Meta', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'error' })
    }
  }

  const refreshInsights = async (c: CTWACampaign) => {
    try {
      await fetch(`/api/ctwa/campaigns/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshInsights: true }),
      })
      toast({ title: 'Stats refreshed', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err.message, variant: 'error' })
    }
  }

  const remove = async (c: CTWACampaign) => {
    if (!(await confirm({
      title: `Archive "${c.name}"?`,
      message: 'The ad will be paused in Meta. Already-delivered ads are not deleted from Meta — only from your MarketMitra dashboard.',
      confirmText: 'Archive',
    }))) return
    try {
      await fetch(`/api/ctwa/campaigns/${c.id}`, { method: 'DELETE' })
      toast({ title: 'Archived', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Archive failed', description: err.message, variant: 'error' })
    }
  }

  const totalLeads = campaigns.reduce((acc, c) => acc + c.leads, 0)
  const totalSpent = campaigns.reduce((acc, c) => acc + c.spentPaise, 0)
  const totalImpressions = campaigns.reduce((acc, c) => acc + c.impressions, 0)
  const totalClicks = campaigns.reduce((acc, c) => acc + c.clicks, 0)
  const activeCount = campaigns.filter((c) => c.status === 'active').length

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Megaphone className="w-7 h-7 text-teal-600" />
            Click-to-WhatsApp Ads
          </h1>
          <p className="text-ink-600 mt-1">
            Run Meta ads with a "Send Message" button. Clicks open WhatsApp — our AI bot takes over.
          </p>
        </div>
        <Button variant="brand" onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />New CTWA campaign
        </Button>
      </div>

      {/* Tip card */}
      <Card>
        <CardContent className="p-4 bg-blue-50 border-blue-200 text-sm text-blue-900 space-y-2">
          <div className="font-semibold">How CTWA works</div>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Create a campaign → it gets pushed to your Meta Ads account (paused).</li>
            <li>Review & activate in Meta Ads Manager.</li>
            <li>When someone taps your ad, WhatsApp opens with your welcome message pre-filled.</li>
            <li>Our AI bot handles the conversation — qualified leads get tagged <code className="bg-white px-1 rounded">ctwa_lead</code> automatically.</li>
          </ol>
        </CardContent>
      </Card>

      {/* Aggregate stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Active campaigns" value={activeCount} icon={Megaphone} />
          <StatCard label="Total leads" value={totalLeads} icon={Users} />
          <StatCard label="Impressions" value={totalImpressions.toLocaleString('en-IN')} icon={Eye} />
          <StatCard label="Clicks" value={totalClicks.toLocaleString('en-IN')} icon={MousePointerClick} />
          <StatCard label="Total spend" value={`₹${(totalSpent / 100).toFixed(0)}`} icon={DollarSign} />
        </div>
      )}

      {creating && (
        <CTWAEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
      )}

      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Megaphone className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No CTWA campaigns yet</p>
              <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
                Drive leads from Facebook & Instagram ads directly into your WhatsApp inbox. Our AI handles the rest.
              </p>
              <Button variant="brand" className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" />Create your first CTWA campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          campaigns.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-ink-900">{c.name}</span>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                        c.status === 'active' ? 'bg-green-100 text-green-700' :
                        c.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                        c.status === 'completed' ? 'bg-ink-100 text-ink-600' :
                        'bg-blue-100 text-blue-700'
                      }`}>{c.status}</span>
                    </div>
                    <div className="text-sm text-ink-700 mt-1">{c.adHeadline}</div>
                    <div className="text-xs text-ink-500 mt-1 line-clamp-2">{c.adBody}</div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 text-xs">
                      <Metric label="Leads" value={c.leads} icon={Users} />
                      <Metric label="Impressions" value={c.impressions.toLocaleString('en-IN')} icon={Eye} />
                      <Metric label="Clicks" value={c.clicks.toLocaleString('en-IN')} icon={MousePointerClick} />
                      <Metric label="Spent" value={`₹${(c.spentPaise / 100).toFixed(0)}`} icon={DollarSign} />
                      <Metric
                        label="CPL"
                        value={c.leads > 0 ? `₹${(c.spentPaise / 100 / c.leads).toFixed(0)}` : '—'}
                        icon={TrendingUp}
                      />
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => refreshInsights(c)} title="Refresh stats from Meta">
                      <RefreshCw className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleStatus(c)} title={c.status === 'active' ? 'Pause' : 'Activate'}>
                      {c.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </Button>
                    {c.metaCampaignId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(`https://business.facebook.com/adsmanager/manage/campaigns?ids=${c.metaCampaignId}`, '_blank')}
                        title="Open in Meta Ads Manager"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} className="text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className="w-4 h-4 text-ink-500 mb-1" />
        <div className="text-xl font-bold text-ink-900">{value}</div>
        <div className="text-xs text-ink-500">{label}</div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] text-ink-500 uppercase tracking-wide">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className="text-sm font-semibold text-ink-900">{value}</div>
    </div>
  )
}

// ============================================================
// CTWA EDITOR
// ============================================================

function CTWAEditor({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('🙏 Hi! How can we help you today?')
  const [adHeadline, setAdHeadline] = useState('')
  const [adBody, setAdBody] = useState('')
  const [adImageUrl, setAdImageUrl] = useState('')
  const [pageId, setPageId] = useState('')
  const [adAccountId, setAdAccountId] = useState('')
  const [dailyBudgetRupees, setDailyBudgetRupees] = useState(500)
  const [ageMin, setAgeMin] = useState(25)
  const [ageMax, setAgeMax] = useState(55)
  const [locations, setLocations] = useState('IN')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim() || !phoneNumber || !welcomeMessage || !adHeadline || !adBody || !pageId || !adAccountId) {
      toast({ title: 'All fields required', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/ctwa/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phoneNumber,
          welcomeMessage,
          adHeadline,
          adBody,
          adImageUrl: adImageUrl || undefined,
          pageId,
          adAccountId,
          dailyBudgetPaise: dailyBudgetRupees * 100,
          audience: {
            ageMin,
            ageMax,
            locations: locations.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      toast({
        title: 'Campaign created in Meta (paused)',
        description: 'Open Meta Ads Manager to review and activate.',
        variant: 'success',
      })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Create failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>New CTWA campaign</span>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Campaign name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali Smile Makeover" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">WhatsApp phone (E.164)</label>
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+919876543210" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 mb-1.5 block">
            Welcome message (pre-fills in customer's WhatsApp)
          </label>
          <Input value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 mb-1.5 block">Ad headline (40 char max)</label>
          <Input
            value={adHeadline}
            onChange={(e) => setAdHeadline(e.target.value.slice(0, 40))}
            placeholder="Book Your Dental Checkup Today"
            maxLength={40}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 mb-1.5 block">Ad body (125 char max)</label>
          <textarea
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[80px]"
            value={adBody}
            onChange={(e) => setAdBody(e.target.value.slice(0, 125))}
            placeholder="Tap to chat with us on WhatsApp. Free consultation, no commitment."
            maxLength={125}
          />
          <div className="text-xs text-ink-500 mt-1 text-right">{adBody.length} / 125</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Meta Page ID</label>
            <Input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="1234567890" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Meta Ad Account ID (act_xxx)</label>
            <Input value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)} placeholder="act_1234567890" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-600 mb-1.5 block">Daily budget (₹)</label>
          <Input
            type="number"
            min={100}
            value={dailyBudgetRupees}
            onChange={(e) => setDailyBudgetRupees(parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Age min</label>
            <Input type="number" value={ageMin} onChange={(e) => setAgeMin(parseInt(e.target.value) || 18)} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Age max</label>
            <Input type="number" value={ageMax} onChange={(e) => setAgeMax(parseInt(e.target.value) || 65)} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Locations</label>
            <Input
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              placeholder="IN, US"
            />
            <div className="text-[10px] text-ink-500 mt-1">ISO country codes, comma-separated</div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Create campaign (in Meta, paused)
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}
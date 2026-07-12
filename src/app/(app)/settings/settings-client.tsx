'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/confirm-dialog'
import { Save, Star, Gift, Calendar, TrendingUp, AlertTriangle, MessageCircle, CheckCircle2, XCircle, Loader2, Download, Trash2, Mail, Bell, Globe, Lock, ArrowUpRight, FileText, Shield } from 'lucide-react'
import { IntegrationsCard } from '@/components/integrations-card'
import { TwoFactorSetupModal } from './two-factor-setup-modal'

interface BusinessData {
  id: string
  name: string
  ownerName: string
  city: string
  state: string | null
  language: string
  timezone: string
  currency: string
  whatsappConnected: boolean
  whatsappPhone: string | null
  instagramConnected: boolean
  googleAdsConnected: boolean
  voiceConnected: boolean
  googleCalendarId: string | null
  razorpayCustomerId: string | null
  googleReviewUrl: string | null
  reviewRequestDelayHours: number
  birthdayWishesEnabled: boolean
  festivalCampaignsEnabled: boolean
  confirmationsEnabled: boolean
  noShowPredictionEnabled: boolean
  wishOfferPercent: number
  notifyByEmail: boolean
  notifyByWhatsapp: boolean
  dailySummaryHour: number
  twoFactorEnabled: boolean
  pausedAt: Date | null
  deletedAt: Date | null
}

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST, UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, UTC+8)' },
  { value: 'Asia/Manila', label: 'Philippines (PHT, UTC+8)' },
  { value: 'America/New_York', label: 'New York (EST, UTC-5)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST, UTC-8)' },
  { value: 'Europe/London', label: 'London (GMT, UTC+0)' },
]

export function SettingsClient({ business }: { business: BusinessData }) {
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const [saving, setSaving] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: business.name,
    ownerName: business.ownerName,
    city: business.city,
    state: business.state || '',
    language: business.language,
    timezone: business.timezone,
    currency: business.currency,
    googleReviewUrl: business.googleReviewUrl || '',
    reviewRequestDelayHours: business.reviewRequestDelayHours,
    birthdayWishesEnabled: business.birthdayWishesEnabled,
    festivalCampaignsEnabled: business.festivalCampaignsEnabled,
    confirmationsEnabled: business.confirmationsEnabled,
    noShowPredictionEnabled: business.noShowPredictionEnabled,
    wishOfferPercent: business.wishOfferPercent,
    notifyByEmail: business.notifyByEmail,
    notifyByWhatsapp: business.notifyByWhatsapp,
    dailySummaryHour: business.dailySummaryHour,
  })
  const [integrations, setIntegrations] = useState({
    whatsapp: business.whatsappConnected,
    instagram: business.instagramConnected,
    google: business.googleAdsConnected,
    voice: business.voiceConnected,
    google_calendar: !!business.googleCalendarId,
    razorpay: !!business.razorpayCustomerId,
  })
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(business.twoFactorEnabled)
  const [twoFactorSetupOpen, setTwoFactorSetupOpen] = useState(false)

  const save = async (section: string) => {
    setSaving(section)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      toast({ title: `${section} saved`, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(null)
    }
  }

  const toggleIntegration = async (name: string, currentState: boolean) => {
    const method = currentState ? 'DELETE' : 'POST'
    const url = `/api/integrations/${name}`
    setSaving(name)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.envVars) {
          toast({
            title: 'Server credentials missing',
            description: `Ask your admin to set: ${data.envVars.join(', ')}`,
            variant: 'error',
          })
        } else {
          throw new Error(data.error || 'Failed')
        }
        return
      }
      setIntegrations({ ...integrations, [name]: !currentState })
      toast({ title: `${name} ${currentState ? 'disconnected' : 'connected'}`, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(null)
    }
  }

  const exportData = async (format: 'csv' | 'json') => {
    try {
      const res = await fetch(`/api/export?type=all&format=${format}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `marketmitra-export-${new Date().toISOString().split('T')[0]}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Export downloaded', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'error' })
    }
  }

  return (
    <>
      {/* Business profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-teal-600" />
            Business profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Business name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Owner name *</label>
              <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">City *</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">State</label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Madhya Pradesh" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Timezone *</label>
              <select
                className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              >
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Currency</label>
              <select
                className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              >
                <option value="INR">₹ Indian Rupee (INR)</option>
                <option value="USD">$ US Dollar (USD)</option>
                <option value="AED">د.إ UAE Dirham (AED)</option>
                <option value="SGD">S$ Singapore Dollar (SGD)</option>
                <option value="PHP">₱ Philippine Peso (PHP)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Default conversation language</label>
              <select
                className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="hinglish">Hinglish (Hindi + English)</option>
                <option value="hi">Hindi (Devanagari)</option>
                <option value="en">English</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
                <option value="bn">Bengali</option>
                <option value="mr">Marathi</option>
                <option value="gu">Gujarati</option>
                <option value="kn">Kannada</option>
                <option value="ml">Malayalam</option>
                <option value="pa">Punjabi</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Profile')} disabled={saving !== null}>
              {saving === 'Profile' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integrations - per-tenant credentials */}
      <IntegrationsCard onChange={() => window.location.reload()} />

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-600" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">Email alerts</div>
              <div className="text-xs text-ink-500">Get notified about important events (failed payments, no-shows, etc.)</div>
            </div>
            <button
              onClick={() => setForm({ ...form, notifyByEmail: !form.notifyByEmail })}
              className={`relative w-10 h-6 rounded-full transition ${form.notifyByEmail ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.notifyByEmail ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">WhatsApp alerts</div>
              <div className="text-xs text-ink-500">Urgent alerts also sent to your WhatsApp</div>
            </div>
            <button
              onClick={() => setForm({ ...form, notifyByWhatsapp: !form.notifyByWhatsapp })}
              className={`relative w-10 h-6 rounded-full transition ${form.notifyByWhatsapp ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.notifyByWhatsapp ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">
              Daily summary at <strong>{form.dailySummaryHour}:00</strong> ({TIMEZONES.find((t) => t.value === form.timezone)?.label.split(' ')[0]})
            </label>
            <input
              type="range"
              min="6"
              max="22"
              value={form.dailySummaryHour}
              onChange={(e) => setForm({ ...form, dailySummaryHour: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Notifications')} disabled={saving !== null}>
              {saving === 'Notifications' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-600" />
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">Password</div>
              <div className="text-xs text-ink-500">Last changed 30 days ago</div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href="/settings/change-password">Change</a>
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-teal-600" />
                Two-factor authentication
              </div>
              <div className="text-xs text-ink-500">
                {twoFactorEnabled ? '✅ Enabled — using authenticator app' : 'Not enabled — add an extra layer of security'}
              </div>
            </div>
            <Button
              size="sm"
              variant={twoFactorEnabled ? 'outline' : 'brand'}
              onClick={async () => {
                if (twoFactorEnabled) {
                  if (!(await confirm({
                    title: 'Disable two-factor authentication?',
                    message: 'You will only need your password to log in. Anyone with your password will be able to sign in to your account.',
                    confirmText: 'Disable 2FA',
                    destructive: true,
                  }))) return
                  const res = await fetch('/api/settings/2fa', { method: 'DELETE' })
                  if (res.ok) {
                    setTwoFactorEnabled(false)
                    toast({ title: '2FA disabled', variant: 'success' })
                  } else {
                    toast({ title: 'Could not disable 2FA', variant: 'error' })
                  }
                } else {
                  setTwoFactorSetupOpen(true)
                }
              }}
            >
              {twoFactorEnabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automations - Tier 1 */}
      <Card>
        <CardHeader>
          <CardTitle>Smart automations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google review */}
          <div className="p-4 border border-ink-100 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-ink-900 text-sm">Google review requests</h3>
              </div>
              <Badge variant={form.googleReviewUrl ? 'success' : 'secondary'}>{form.googleReviewUrl ? 'ON' : 'OFF'}</Badge>
            </div>
            <Input
              placeholder="https://g.page/r/your-business/review"
              value={form.googleReviewUrl}
              onChange={(e) => setForm({ ...form, googleReviewUrl: e.target.value })}
            />
            <div>
              <label className="text-xs font-medium text-ink-600">
                Send <strong>{form.reviewRequestDelayHours}h</strong> after visit
              </label>
              <input
                type="range" min="1" max="24" value={form.reviewRequestDelayHours}
                onChange={(e) => setForm({ ...form, reviewRequestDelayHours: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>

          {/* Birthday */}
          <div className="p-4 border border-ink-100 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-pink-600" />
                <h3 className="font-bold text-ink-900 text-sm">Birthday & anniversary wishes</h3>
              </div>
              <button
                onClick={() => setForm({ ...form, birthdayWishesEnabled: !form.birthdayWishesEnabled })}
                className={`relative w-10 h-6 rounded-full transition ${form.birthdayWishesEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
              >
                <span className={`absolute top-0.5 ${form.birthdayWishesEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
              </button>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600">
                Offer: <strong>{form.wishOfferPercent}%</strong> off
              </label>
              <input
                type="range" min="0" max="30" value={form.wishOfferPercent}
                onChange={(e) => setForm({ ...form, wishOfferPercent: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>

          {/* Festival */}
          <div className="flex items-center justify-between p-4 border border-ink-100 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-ink-900 text-sm">Festival campaigns</h3>
            </div>
            <button
              onClick={() => setForm({ ...form, festivalCampaignsEnabled: !form.festivalCampaignsEnabled })}
              className={`relative w-10 h-6 rounded-full transition ${form.festivalCampaignsEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.festivalCampaignsEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>

          {/* No-show */}
          <div className="p-4 border border-ink-100 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-ink-900 text-sm">No-show prediction</h3>
              </div>
              <button
                onClick={() => setForm({ ...form, noShowPredictionEnabled: !form.noShowPredictionEnabled })}
                className={`relative w-10 h-6 rounded-full transition ${form.noShowPredictionEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
              >
                <span className={`absolute top-0.5 ${form.noShowPredictionEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
              </button>
            </div>
            <div className="flex items-center justify-between pl-7">
              <div className="text-xs text-ink-600">Send confirmation requests to high-risk</div>
              <button
                onClick={() => setForm({ ...form, confirmationsEnabled: !form.confirmationsEnabled })}
                className={`relative w-9 h-5 rounded-full transition ${form.confirmationsEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
              >
                <span className={`absolute top-0.5 ${form.confirmationsEnabled ? 'left-4' : 'left-0.5'} w-4 h-4 bg-white rounded-full shadow transition-all`} />
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Automations')} disabled={saving !== null}>
              {saving === 'Automations' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save all automations
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data & account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-green-600" />
            Data & account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">Export all data</div>
              <div className="text-xs text-ink-500">Download customers, campaigns, appointments, messages (CSV or JSON)</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => exportData('csv')}>CSV</Button>
              <Button size="sm" variant="outline" onClick={() => exportData('json')}>JSON</Button>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 border border-amber-200 bg-amber-50/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">Pause account</div>
              <div className="text-xs text-ink-500">Stop all AI automations. Customers can still view widget but AI won't respond.</div>
            </div>
            <Button size="sm" variant="outline" onClick={async () => {
              if (!(await confirm({
                title: 'Pause all AI automations?',
                message: 'All campaigns, drips, auto-replies and AI workflows will stop running. Customers will not receive any automated messages until you resume.',
                confirmText: 'Pause all',
                destructive: true,
              }))) return
              const res = await fetch('/api/settings/pause', { method: 'POST' })
              if (res.ok) toast({ title: 'Account paused', variant: 'success' })
            }}>Pause</Button>
          </div>
          <div className="flex items-center justify-between p-3 border border-red-200 bg-red-50/50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-red-900">Delete account</div>
              <div className="text-xs text-red-700">Permanently delete all data. Cannot be undone.</div>
            </div>
            <Button size="sm" variant="destructive" onClick={async () => {
              if (!(await confirm({
                title: 'Permanently delete your business?',
                message: 'This will erase your business and ALL its data — customers, appointments, conversations, campaigns, drips, templates, knowledge base, billing history. This cannot be undone.',
                confirmText: 'Yes, delete forever',
                destructive: true,
              }))) return
              const res = await fetch('/api/settings/delete', { method: 'POST' })
              if (res.ok) window.location.href = '/'
            }}>
              <Trash2 className="w-4 h-4" />Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Billing Details (editable — replaces hardcoded GST in Billing page) */}
      <TaxSettingsCard />

      {/* 2FA setup modal (real TOTP — replaces the old prompt() stub) */}
      {twoFactorSetupOpen && (
        <TwoFactorSetupModal
          onClose={() => setTwoFactorSetupOpen(false)}
          onSuccess={() => {
            setTwoFactorEnabled(true)
            setTwoFactorSetupOpen(false)
            // Refresh to pick up the new state from the server
            setTimeout(() => window.location.reload(), 800)
          }}
        />
      )}
    </>
  )
}

// Tax settings: legal name, GSTIN, PAN, HSN/SAC, address
// Persisted via /api/me/business-tax
function TaxSettingsCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    legalName: '',
    gstin: '',
    pan: '',
    hsnSac: '998365',
    stateCode: '',
    taxScheme: 'regular',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingPincode: '',
  })

  useEffect(() => {
    fetch('/api/me/business-tax')
      .then((r) => r.json())
      .then((data) => {
        if (data.tax) setForm((f) => ({ ...f, ...data.tax }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/me/business-tax', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (data.tax) setForm({ ...form, ...data.tax })
      toast({ title: 'Tax details saved', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Could not save', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Tax & Billing details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-ink-500">
          These details appear on every invoice we generate for you. GSTIN is optional — only fill if you're registered.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">Legal / Trade name</label>
            <Input
              placeholder="As on GST certificate"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">GSTIN</label>
            <Input
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              className="font-mono"
              disabled={loading}
            />
            <p className="text-xs text-ink-500 mt-1">15-char. We auto-derive state code + PAN.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">PAN</label>
            <Input
              placeholder="AAAAA0000A"
              maxLength={10}
              value={form.pan}
              onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
              className="font-mono"
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">HSN/SAC code</label>
            <Input
              placeholder="998365"
              value={form.hsnSac}
              onChange={(e) => setForm({ ...form, hsnSac: e.target.value })}
              className="font-mono"
              disabled={loading}
            />
            <p className="text-xs text-ink-500 mt-1">998365 = Marketing services. 9993 = Dental & health.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">Tax scheme</label>
            <select
              className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
              value={form.taxScheme}
              onChange={(e) => setForm({ ...form, taxScheme: e.target.value })}
              disabled={loading}
            >
              <option value="regular">Regular (file monthly GSTR)</option>
              <option value="composition">Composition (pays turnover tax)</option>
              <option value="exempt">Exempt / Unregistered</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-700 mb-1.5 block">State code</label>
            <Input
              placeholder="23 (auto from GSTIN)"
              maxLength={2}
              value={form.stateCode}
              onChange={(e) => setForm({ ...form, stateCode: e.target.value.replace(/\D/g, '') })}
              className="font-mono"
              disabled={loading}
            />
          </div>
        </div>

        <div className="pt-2 border-t border-ink-100">
          <p className="text-xs font-semibold text-ink-700 mb-2">Billing address (printed on invoices)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-ink-700 mb-1.5 block">Address</label>
              <Input
                placeholder="123 MG Road, Sector 5"
                value={form.billingAddress}
                onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 mb-1.5 block">City</label>
              <Input
                value={form.billingCity}
                onChange={(e) => setForm({ ...form, billingCity: e.target.value })}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 mb-1.5 block">State</label>
              <Input
                value={form.billingState}
                onChange={(e) => setForm({ ...form, billingState: e.target.value })}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-700 mb-1.5 block">Pincode</label>
              <Input
                placeholder="452001"
                maxLength={6}
                value={form.billingPincode}
                onChange={(e) => setForm({ ...form, billingPincode: e.target.value.replace(/\D/g, '') })}
                className="font-mono"
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="brand" onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save tax details
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
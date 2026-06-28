'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Save, Star, Gift, Calendar, TrendingUp, AlertTriangle, MessageCircle } from 'lucide-react'

interface Props {
  business: {
    id: string
    name: string
    ownerName: string
    city: string
    language: string
    googleReviewUrl: string | null
    reviewRequestDelayHours: number
    birthdayWishesEnabled: boolean
    festivalCampaignsEnabled: boolean
    confirmationsEnabled: boolean
    noShowPredictionEnabled: boolean
    wishOfferPercent: number
    businessSince: string | null
  }
}

export function SettingsForm({ business }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: business.name,
    ownerName: business.ownerName,
    city: business.city,
    language: business.language,
    googleReviewUrl: business.googleReviewUrl || '',
    reviewRequestDelayHours: business.reviewRequestDelayHours,
    birthdayWishesEnabled: business.birthdayWishesEnabled,
    festivalCampaignsEnabled: business.festivalCampaignsEnabled,
    confirmationsEnabled: business.confirmationsEnabled,
    noShowPredictionEnabled: business.noShowPredictionEnabled,
    wishOfferPercent: business.wishOfferPercent,
  })

  const save = async (section: string) => {
    setSaving(true)
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
      setSaving(false)
    }
  }

  return (
    <>
      {/* Business profile */}
      <Card>
        <CardHeader><CardTitle>Business profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Business name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Owner name</label>
              <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">City</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
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
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Profile')} disabled={saving}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation: Google reviews */}
      <Card id="review">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-600" />
            Google review requests
            <Badge variant={form.googleReviewUrl ? 'success' : 'secondary'}>
              {form.googleReviewUrl ? 'ON' : 'OFF'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-600">
            After every visit, we automatically send a WhatsApp asking the customer to leave a Google review.
            AI personalizes the message and includes your review link.
          </p>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">
              Your Google review link
            </label>
            <Input
              placeholder="https://g.page/r/your-business/review"
              value={form.googleReviewUrl}
              onChange={(e) => setForm({ ...form, googleReviewUrl: e.target.value })}
            />
            <p className="text-xs text-ink-500 mt-1.5">
              Get this from your Google Business Profile → "Get more reviews" → Copy link
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">
              Send review request <strong>{form.reviewRequestDelayHours}h</strong> after visit
            </label>
            <input
              type="range"
              min="1"
              max="24"
              value={form.reviewRequestDelayHours}
              onChange={(e) => setForm({ ...form, reviewRequestDelayHours: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Review settings')} disabled={saving}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation: Birthday wishes */}
      <Card id="birthday">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-pink-600" />
            Birthday & anniversary wishes
            <Badge variant={form.birthdayWishesEnabled ? 'success' : 'secondary'}>
              {form.birthdayWishesEnabled ? 'ON' : 'OFF'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-600">
            At 9 AM on each customer's birthday, we send a personalized Hinglish wish with a special offer.
            Add birthdays to customer profiles to enable this.
          </p>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <span className="text-sm text-ink-700">Send birthday wishes</span>
            <button
              onClick={() => setForm({ ...form, birthdayWishesEnabled: !form.birthdayWishesEnabled })}
              className={`relative w-10 h-6 rounded-full transition ${form.birthdayWishesEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.birthdayWishesEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">
              Special offer: <strong>{form.wishOfferPercent}%</strong> off for birthday customer
            </label>
            <input
              type="range"
              min="0"
              max="30"
              value={form.wishOfferPercent}
              onChange={(e) => setForm({ ...form, wishOfferPercent: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Birthday settings')} disabled={saving}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation: Festival campaigns */}
      <Card id="festivals">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Festival campaigns
            <Badge variant={form.festivalCampaignsEnabled ? 'success' : 'secondary'}>
              {form.festivalCampaignsEnabled ? 'ON' : 'OFF'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-600">
            AI generates festival-specific offers for 18 Indian festivals (Diwali, Holi, Eid, Raksha Bandhan, etc.)
            and sends to all your customers 3 days before each festival.
          </p>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <span className="text-sm text-ink-700">Auto-send festival offers</span>
            <button
              onClick={() => setForm({ ...form, festivalCampaignsEnabled: !form.festivalCampaignsEnabled })}
              className={`relative w-10 h-6 rounded-full transition ${form.festivalCampaignsEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.festivalCampaignsEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('Festival settings')} disabled={saving}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automation: Recurring appointments */}
      <Card id="recurring">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            Recurring appointments
            <Badge variant="success">ON</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-600">
            When a visit completes, we auto-propose the next appointment (e.g. dental cleaning in 6 months).
            Customer confirms via WhatsApp with "YES" or picks a new time.
          </p>
          <p className="text-xs text-ink-500">
            Service-level recurrence rules can be set in <a href="/services" className="text-teal-600 underline">Services</a>.
          </p>
        </CardContent>
      </Card>

      {/* Automation: No-show prediction */}
      <Card id="noshow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            No-show prediction
            <Badge variant={form.noShowPredictionEnabled ? 'success' : 'secondary'}>
              {form.noShowPredictionEnabled ? 'ON' : 'OFF'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-600">
            AI scores every appointment 0-1. High-risk customers get a confirmation request 24h before.
            Unconfirmed high-risk appointments are auto-cancelled to free up the slot.
          </p>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <span className="text-sm text-ink-700">No-show prediction</span>
            <button
              onClick={() => setForm({ ...form, noShowPredictionEnabled: !form.noShowPredictionEnabled })}
              className={`relative w-10 h-6 rounded-full transition ${form.noShowPredictionEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.noShowPredictionEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <span className="text-sm text-ink-700">Send confirmation requests</span>
            <button
              onClick={() => setForm({ ...form, confirmationsEnabled: !form.confirmationsEnabled })}
              className={`relative w-10 h-6 rounded-full transition ${form.confirmationsEnabled ? 'bg-teal-600' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.confirmationsEnabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
          <div className="flex justify-end">
            <Button variant="brand" onClick={() => save('No-show settings')} disabled={saving}>
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Integrations</CardTitle>
            <Badge variant="success">3 connected</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { icon: '💬', name: 'WhatsApp Business', desc: 'Connect your own WhatsApp Business account', connected: true, color: 'bg-green-100' },
            { icon: '📸', name: 'Instagram', desc: '@smilcaredental.indore • 320 followers', connected: true, color: 'bg-pink-100' },
            { icon: '🎯', name: 'Google Ads', desc: 'Account 482-339-2014', connected: true, color: 'bg-blue-100' },
            { icon: '📞', name: 'Voice (Twilio)', desc: 'For AI-driven phone calls', connected: false, color: 'bg-purple-100' },
            { icon: '📅', name: 'Google Calendar', desc: 'Sync appointments automatically', connected: false, color: 'bg-blue-100' },
            { icon: '💳', name: 'Razorpay', desc: 'For billing & autopay', connected: true, color: 'bg-indigo-100' },
          ].map((int) => (
            <div key={int.name} className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${int.color} rounded-lg flex items-center justify-center text-xl`}>{int.icon}</div>
                <div>
                  <div className="font-medium text-ink-900">{int.name}</div>
                  <div className="text-xs text-ink-500">{int.desc}</div>
                </div>
              </div>
              {int.connected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Button variant="outline" size="sm">Connect</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
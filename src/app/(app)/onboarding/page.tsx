'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Check, ArrowRight, ArrowLeft, MessageSquare, Phone, Instagram, Sparkles, Loader2 } from 'lucide-react'

const verticals = [
  { id: 'dental', emoji: '🦷', name: 'Dental clinic' },
  { id: 'salon', emoji: '💇‍♀️', name: 'Salon / Spa' },
  { id: 'clinic', emoji: '🩺', name: 'Doctor clinic' },
  { id: 'restaurant', emoji: '🍽️', name: 'Restaurant' },
  { id: 'real_estate', emoji: '🏠', name: 'Real estate' },
  { id: 'coaching', emoji: '📚', name: 'Coaching / Tuition' },
]

const steps = [
  { id: 1, title: 'Choose your business type', desc: 'So AI knows the playbook' },
  { id: 2, title: 'Tell us about your business', desc: 'Name, city, contact' },
  { id: 3, title: 'Connect WhatsApp', desc: 'AI will use this to talk to customers' },
  { id: 4, title: 'Connect other channels', desc: 'Optional — but recommended' },
  { id: 5, title: 'Add your services', desc: 'What you sell, prices, duration' },
  { id: 6, title: "You're all set! 🎉", desc: 'AI starts working in 5 minutes' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState({
    vertical: 'dental',
    businessName: '',
    city: '',
    state: '',
    language: 'hinglish',
    knowledge: '',
    whatsappConnected: false,
    whatsappPhone: '',
    instagramConnected: false,
    voiceConnected: false,
    googleAdsConnected: false,
    services: [
      { name: 'Consultation', duration: '30', price: '500' },
      { name: 'Follow-up', duration: '15', price: '200' },
    ],
  })

  const update = (k: string, v: any) => setData({ ...data, [k]: v })

  const finish = async () => {
    setSaving(true)
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const next = () => {
    if (step < steps.length) setStep(step + 1)
    if (step === steps.length - 1) finish()
  }

  const back = () => {
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-ink-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 gradient-brand rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <span className="font-bold text-ink-900">MarketMitra</span>
          </Link>
          <div className="text-xs text-ink-500">20-minute setup • AI handles the rest</div>
        </div>

        <div className="flex items-center justify-between mb-8 px-2">
          {steps.map((s) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step > s.id ? 'bg-teal-600 text-white' : step === s.id ? 'gradient-brand text-white shadow-lg' : 'bg-ink-100 text-ink-400'}`}>
                {step > s.id ? <Check className="w-4 h-4" /> : s.id}
              </div>
              {s.id < steps.length && (
                <div className={`flex-1 h-1 mx-2 ${step > s.id ? 'bg-teal-600' : 'bg-ink-100'}`} />
              )}
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-ink-900">{steps[step - 1].title}</h2>
              <p className="text-ink-500 mt-1">{steps[step - 1].desc}</p>
            </div>

            {step === 1 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {verticals.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => update('vertical', v.id)}
                    className={`p-5 border-2 rounded-xl text-left transition ${data.vertical === v.id ? 'border-teal-600 bg-teal-50' : 'border-ink-200 hover:border-teal-300'}`}
                  >
                    <div className="text-3xl mb-2">{v.emoji}</div>
                    <div className="font-semibold text-ink-900 text-sm">{v.name}</div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Business name</label>
                  <Input placeholder="e.g. SmileCare Dental" value={data.businessName} onChange={(e) => update('businessName', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ink-600 mb-1.5 block">City</label>
                    <Input placeholder="Indore" value={data.city} onChange={(e) => update('city', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ink-600 mb-1.5 block">State</label>
                    <Input placeholder="Madhya Pradesh" value={data.state} onChange={(e) => update('state', e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">AI conversation language</label>
                  <select className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white" value={data.language} onChange={(e) => update('language', e.target.value)}>
                    <option value="hinglish">Hinglish (Hindi + English mix)</option>
                    <option value="hindi">Hindi (Devanagari)</option>
                    <option value="english">English</option>
                    <option value="tamil">Tamil</option>
                    <option value="telugu">Telugu</option>
                    <option value="bengali">Bengali</option>
                    <option value="marathi">Marathi</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Anything special AI should know? (optional)</label>
                  <textarea
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[80px]"
                    placeholder="E.g. Free first consultation for kids under 12. We accept all major insurance."
                    value={data.knowledge}
                    onChange={(e) => update('knowledge', e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className={`p-6 rounded-xl text-center mb-4 border-2 border-dashed ${data.whatsappConnected ? 'border-green-300 bg-green-50' : 'border-ink-200 bg-ink-50'}`}>
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center text-2xl ${data.whatsappConnected ? 'bg-green-600 text-white' : 'bg-white border-2 border-green-500'}`}>📱</div>
                  <div className="text-sm font-semibold text-ink-900 mb-1">
                    {data.whatsappConnected ? 'WhatsApp connected ✓' : 'Connect your WhatsApp Business number'}
                  </div>
                  <div className="text-xs text-ink-600 mb-3">
                    {data.whatsappConnected
                      ? `Number: ${data.whatsappPhone || 'connected via Meta Cloud API'}`
                      : 'Point your Meta/AiSensy/360dialog webhook at your app URL'}
                  </div>
                  {!data.whatsappConnected ? (
                    <>
                      <Input
                        placeholder="+91 98765 43210"
                        value={data.whatsappPhone}
                        onChange={(e) => update('whatsappPhone', e.target.value)}
                        className="max-w-xs mx-auto mb-2"
                      />
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => update('whatsappConnected', true)}
                      >
                        Mark as connected
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => update('whatsappConnected', false)}>
                      Disconnect
                    </Button>
                  )}
                </div>
                <div className="text-xs text-ink-500 text-center">
                  Need help? Setup guide in <Link href="/settings" className="text-teal-700 underline">Settings</Link> after signup.
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {[
                  { key: 'instagramConnected', icon: Instagram, name: 'Instagram', desc: 'AI will generate reels & posts for you', color: 'bg-pink-100 text-pink-700' },
                  { key: 'voiceConnected', icon: Phone, name: 'Voice AI', desc: 'AI calls past customers for reactivation', color: 'bg-purple-100 text-purple-700' },
                  { key: 'googleAdsConnected', icon: Sparkles, name: 'Google Ads', desc: 'AI launches & A/B tests search ads', color: 'bg-blue-100 text-blue-700' },
                ].map((ch) => {
                  const Icon = ch.icon
                  const enabled = (data as any)[ch.key]
                  return (
                    <div key={ch.key} className="flex items-center justify-between p-4 border border-ink-100 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${ch.color} rounded-lg flex items-center justify-center`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-ink-900 text-sm">{ch.name}</div>
                          <div className="text-xs text-ink-500">{ch.desc}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => update(ch.key, !enabled)}
                        className={`relative w-10 h-6 rounded-full transition ${enabled ? 'bg-teal-600' : 'bg-ink-200'}`}
                      >
                        <span className={`absolute top-0.5 ${enabled ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
                      </button>
                    </div>
                  )
                })}
                <div className="text-center mt-4">
                  <button onClick={next} className="text-sm text-ink-500 hover:text-ink-700">Skip for now →</button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-3">
                {data.services.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Service name"
                      value={s.name}
                      onChange={(e) => {
                        const newServices = [...data.services]
                        newServices[i] = { ...s, name: e.target.value }
                        update('services', newServices)
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="30 min"
                      value={s.duration}
                      onChange={(e) => {
                        const newServices = [...data.services]
                        newServices[i] = { ...s, duration: e.target.value }
                        update('services', newServices)
                      }}
                      className="w-24"
                    />
                    <Input
                      placeholder="₹500"
                      value={s.price}
                      onChange={(e) => {
                        const newServices = [...data.services]
                        newServices[i] = { ...s, price: e.target.value }
                        update('services', newServices)
                      }}
                      className="w-24"
                    />
                    <button
                      onClick={() => update('services', data.services.filter((_, idx) => idx !== i))}
                      className="text-ink-400 hover:text-red-600 px-2"
                      disabled={data.services.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => update('services', [...data.services, { name: '', duration: '30', price: '500' }])}
                >
                  + Add another service
                </Button>
              </div>
            )}

            {step === 6 && (
              <div className="text-center py-6">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-400 to-teal-600 rounded-full flex items-center justify-center text-4xl">🎉</div>
                <h3 className="text-xl font-bold text-ink-900 mb-2">All set!</h3>
                <p className="text-ink-600 mb-6">AI is warming up. First campaign will go out within minutes.</p>
                <div className="space-y-2 max-w-sm mx-auto text-left">
                  {[
                    'WhatsApp AI inbox is live',
                    `${data.services.length} services saved`,
                    'First daily summary scheduled for 8 PM',
                    data.whatsappConnected ? 'WhatsApp channel connected' : 'Connect WhatsApp in Settings to start',
                  ].map((line, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-ink-700">{line}</span>
                    </div>
                  ))}
                </div>
                <Button variant="brand" size="lg" className="mt-6" onClick={finish} disabled={saving}>
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Setting up...</> : <>Go to dashboard →</>}
                </Button>
              </div>
            )}

            {step < 6 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-ink-100">
                <Button variant="ghost" onClick={back} disabled={step === 1}>
                  <ArrowLeft className="w-4 h-4" />Back
                </Button>
                <Button variant="brand" onClick={next}>
                  {step === 5 ? 'Finish setup' : 'Continue'}<ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6 text-xs text-ink-500">
          Need help? WhatsApp us at <span className="text-teal-700 font-medium">+91-XXXX-XXXX-XX</span>
        </div>
      </div>
    </div>
  )
}
// WhatsApp Coexistence onboarding wizard.
// Walks the user through Meta Embedded Signup + Coexistence setup.

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, Smartphone, RefreshCw, MessageCircle, Phone } from 'lucide-react'
import { COEXISTENCE_DOC_STEPS } from '@/lib/coexistence'

interface CoexistenceStatus {
  storedStatus: {
    enabled: boolean
    whatsappPhone: string
    appId: string | null
    wabaId: string | null
    verifiedAt: string | null
    notes: string | null
  } | null
  liveVerification: {
    enabled: boolean
    phoneNumber?: string
    phoneNumberId?: string
    displayName?: string
    qualityRating?: string
    messagingLimit?: string
    notes?: string
  }
}

export function WhatsAppCoexistence() {
  const { toast } = useToast()
  const [status, setStatus] = useState<CoexistenceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [signupUrl, setSignupUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/coexistence/signup-url')
      .then((r) => r.json())
      .then((d) => setSignupUrl(d.url))
      .catch(() => setSignupUrl(null))
  }, [])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/coexistence')
      const data = await res.json()
      setStatus(data)
    } finally { setLoading(false) }
  }

  const reverify = async () => {
    setVerifying(true)
    try {
      const res = await fetch('/api/coexistence', { method: 'POST' })
      const data = await res.json()
      setStatus({ storedStatus: status?.storedStatus || null, liveVerification: data.result })
      if (data.result.enabled) {
        toast({ title: 'Verified! Coexistence is active', variant: 'success' })
      } else {
        toast({ title: 'Verification failed', description: data.result.notes, variant: 'error' })
      }
    } finally {
      setVerifying(false)
      load()
    }
  }

  const live = status?.liveVerification
  const stored = status?.storedStatus

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
          <Smartphone className="w-7 h-7 text-teal-600" />
          WhatsApp Coexistence
        </h1>
        <p className="text-ink-600 mt-1">
          Keep using your existing WhatsApp number in the WhatsApp Business app AND let MarketMitra reply automatically — no need to switch to a new number.
        </p>
      </div>

      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Current status</span>
            <Button size="sm" variant="outline" onClick={reverify} disabled={verifying}>
              {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Re-verify with Meta
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : live?.enabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-teal-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-semibold">Coexistence active</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field icon={Phone} label="WhatsApp number" value={live.phoneNumber} />
                <Field icon={MessageCircle} label="Display name" value={live.displayName} />
                <Field label="Quality rating" value={
                  <span className={
                    live.qualityRating === 'GREEN' ? 'text-teal-700' :
                    live.qualityRating === 'YELLOW' ? 'text-amber-700' :
                    live.qualityRating === 'RED' ? 'text-red-700' : ''
                  }>{live.qualityRating}</span>
                } />
                <Field label="Messaging limit" value={live.messagingLimit} />
              </div>
              {live.notes && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                  {live.notes}
                </div>
              )}
              {stored?.verifiedAt && (
                <div className="text-xs text-ink-500">
                  Last verified {new Date(stored.verifiedAt).toLocaleString('en-IN')}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Coexistence not yet configured</span>
              </div>
              <p className="text-sm text-ink-600">
                {live?.notes || 'Connect a Meta WhatsApp channel first, then follow the steps below.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Why coexistence matters */}
      <Card>
        <CardContent className="p-4 bg-teal-50 border-teal-200 text-sm text-teal-900">
          <strong>Why Coexistence?</strong> Indian SMBs keep their WhatsApp number for years —
          it's printed on cards, saved in thousands of customer phones, used in ads. Without
          Coexistence, you'd need to migrate to a new number. With it, you keep the same number,
          use the WhatsApp Business app for personal chats, and MarketMitra handles customer
          conversations automatically.
        </CardContent>
      </Card>

      {/* Step-by-step */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {COEXISTENCE_DOC_STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-ink-900">{step.title}</div>
                <p className="text-xs text-ink-600 mt-1">{step.description}</p>
                {step.externalUrl && (
                  <a
                    href={step.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-1"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Embedded signup launcher */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick start: Embedded Signup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-600 mb-3">
            If you've already configured Meta Embedded Signup (steps 2-3 above), you can launch the popup here:
          </p>
          {signupUrl ? (
            <a
              href={signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold"
            >
              <Smartphone className="w-4 h-4" />
              Launch Meta Embedded Signup
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <div className="p-3 bg-ink-50 rounded-lg text-xs text-ink-500">
              Embedded Signup not configured. Set <code>META_APP_ID</code> and{' '}
              <code>META_APP_CONFIG_ID</code> env vars to enable quick signup.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon?: any; label: string; value: React.ReactNode }) {
  return (
    <div className="p-2 bg-ink-50 rounded-lg">
      <div className="text-[10px] text-ink-500 uppercase tracking-wide flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />}{label}
      </div>
      <div className="text-sm font-semibold text-ink-900 mt-0.5">{value || '—'}</div>
    </div>
  )
}
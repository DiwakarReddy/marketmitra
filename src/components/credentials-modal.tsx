'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { X, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle, ExternalLink, Save } from 'lucide-react'
import { getChannelSchema } from '@/lib/channel-schemas'

interface ChannelData {
  channel: string
  label: string
  icon: string
  description: string
  providers?: { value: string; label: string }[]
  fields: { key: string; label: string; type: string; required?: boolean; requiredProviders?: string[]; placeholder?: string; helpText?: string }[]
  testInstructions?: string
  connected: boolean
  provider?: string | null
  config: Record<string, any>
  hasCredentials: boolean
  lastTestStatus?: string
  lastTestError?: string
}

/** Is this field required for the currently-selected provider? */
function fieldIsRequiredForProvider(field: ChannelData['fields'][number], provider: string): boolean {
  if (field.required === true) return true
  if (Array.isArray(field.requiredProviders) && field.requiredProviders.includes(provider)) return true
  return false
}

export function CredentialsModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: ChannelData
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [provider, setProvider] = useState(channel.provider || channel.providers?.[0]?.value || '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  useEffect(() => {
    // Load existing values (masked) for display
    loadExisting()
  }, [])

  const loadExisting = async () => {
    try {
      const res = await fetch(`/api/channels/${channel.channel}`)
      const data = await res.json()
      if (data.values) {
        setValues(data.values)
      }
    } catch (err) {
      // Ignore
    }
  }

  const save = async (skipTest = false) => {
    // Pre-flight client-side check so the user sees errors immediately.
    const missing = channel.fields
      .filter((f) => fieldIsRequiredForProvider(f, provider))
      .filter((f) => {
        const v = values[f.key]
        return !v || (typeof v === 'string' && v.startsWith('•'))
      })
      .map((f) => `${f.label} is required for ${provider || 'this provider'}`)
    if (missing.length > 0) {
      setFieldErrors(missing)
      return
    }
    setFieldErrors([])

    setSaving(true)
    try {
      const res = await fetch(`/api/channels/${channel.channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider || undefined,
          values,
          skipTest,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.testFailed) {
          setTestResult({ ok: false, error: data.details || data.error })
        } else if (data.details && Array.isArray(data.details)) {
          setFieldErrors(data.details)
        } else {
          throw new Error(data.error || 'Save failed')
        }
        return
      }
      toast({ title: `${channel.label} connected!`, variant: 'success' })
      onSaved()
      onClose()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/channels/${channel.channel}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider || undefined,
          values,
          skipTest: false,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({ ok: true })
        toast({ title: 'Connection test passed', variant: 'success' })
      } else {
        setTestResult({ ok: false, error: data.details || data.error })
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">{channel.icon}</div>
              <div>
                <h2 className="text-xl font-bold text-ink-900">Connect {channel.label}</h2>
                <p className="text-sm text-ink-500 mt-0.5">{channel.description}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Provider selector */}
          {channel.providers && channel.providers.length > 0 && (
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Provider</label>
              <select
                className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                value={provider}
                onChange={(e) => { setProvider(e.target.value); setFieldErrors([]); setTestResult(null) }}
              >
                {channel.providers.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-ink-500 mt-1">
                Required fields below are based on the selected provider.
              </p>
            </div>
          )}

{/* Inline validation errors */}
          {fieldErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2 text-red-900">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-bold mb-1">Please fix the following:</div>
                  <ul className="list-disc ml-4 space-y-0.5">
                    {fieldErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

{/* Dynamic fields */}
          {channel.fields.map((field) => {
            const currentValue = values[field.key] || ''
            const isMasked = currentValue.startsWith('•')
            const isSecret = field.type === 'password'
            const show = showSecrets[field.key]
            const required = fieldIsRequiredForProvider(field, provider)

            // Hide fields that are not relevant to the selected provider entirely,
            // so the form isn't a wall of confusing fields.
            const isProviderSpecific = !!field.requiredProviders && !field.required
            const showField = !isProviderSpecific || field.requiredProviders!.includes(provider)
            if (!showField) return null

            return (
              <div key={field.key}>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">
                  {field.label}
                  {required && <span className="text-red-500 ml-1">*</span>}
                  {isProviderSpecific && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-400">
                      {provider}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Input
                    type={isSecret && !show && !isMasked ? 'password' : 'text'}
                    value={currentValue}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    placeholder={isMasked ? '••••••••' : (field.placeholder || '')}
                    className={isSecret && !isMasked ? 'pr-20' : ''}
                  />
                  {isSecret && !isMasked && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowSecrets({ ...showSecrets, [field.key]: !show })}
                        className="p-1 hover:bg-ink-100 rounded"
                        title={show ? 'Hide' : 'Show'}
                      >
                        {show ? <EyeOff className="w-4 h-4 text-ink-500" /> : <Eye className="w-4 h-4 text-ink-500" />}
                      </button>
                    </div>
                  )}
                </div>
                {field.helpText && (
                  <p className="text-xs text-ink-500 mt-1">{field.helpText}</p>
                )}
                {isMasked && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Saved value is hidden — secrets can't be displayed for security. Leave as is to keep it, or type a new value to replace it.
                  </p>
                )}
              </div>
            )
          })}

          {/* Test instructions */}
          {channel.testInstructions && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
              <strong>Setup:</strong> {channel.testInstructions}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              testResult.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              {testResult.ok ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-green-900">Connection test passed</div>
                    <div className="text-sm text-green-800">Your credentials are valid.</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-900">Test failed</div>
                    <div className="text-sm text-red-800">{testResult.error}</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Where to get credentials */}
          <CredentialsHelp channel={channel.channel} />
        </div>

        <div className="p-4 border-t border-ink-100 flex justify-between gap-2 sticky bottom-0 bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={test} disabled={testing || saving}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {testing ? 'Testing...' : 'Test connection'}
            </Button>
            <Button variant="brand" onClick={() => save(true)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : channel.connected ? 'Update' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CredentialsHelp({ channel }: { channel: string }) {
  const links: Record<string, { label: string; url: string; steps: string[]; providerNote?: string }> = {
    whatsapp: {
      label: 'Meta for Developers',
      url: 'https://developers.facebook.com/apps/',
      steps: [
        '1. Create a Meta App → Type: "Business"',
        '2. Add "WhatsApp" product',
        '3. Copy Phone Number ID from WhatsApp → API Setup',
        '4. Generate a permanent System User Access Token',
        '5. Set webhook to: <code>https://yourdomain.com/api/whatsapp/webhook</code>',
      ],
    },
    voice: {
      label: 'Twilio Console',
      url: 'https://console.twilio.com/',
      steps: [
        '1. Sign up at twilio.com',
        '2. Get a phone number with Voice capability',
        '3. Find Account SID and Auth Token on the dashboard',
        '4. Configure voice webhook in Phone Numbers → Configuration',
      ],
    },
    sms: {
      label: 'Choose your SMS provider',
      url: 'https://www.twilio.com/',
      providerNote: 'Switch providers in the dropdown above — each one has different setup steps.',
      steps: [
        'Twilio (global):',
        '• Sign up at twilio.com → Console dashboard',
        '• Copy Account SID + Auth Token',
        '• Get a Twilio phone number → use as From Number',
        '',
        'MSG91 (India, DLT templates):',
        '• Sign up at msg91.com → Dashboard → Settings → API',
        '• Copy Auth Key',
        '• Register a Sender ID at MSG91 → DLT Templates',
        '• Get DLT Template ID for each template (TRAI compliance)',
        '',
        'Plivo (global, cheaper for high volume):',
        '• Sign up at plivo.com → Dashboard',
        '• Copy Auth ID + Auth Token',
        '• Get a Plivo phone number as From Number',
      ],
    },
    email: {
      label: 'Choose your email provider',
      url: 'https://resend.com/api-keys',
      providerNote: 'Switch providers in the dropdown above — each one has different setup steps.',
      steps: [
        'Resend (recommended, best DX):',
        '• Sign up at resend.com → API Keys',
        '• Create an API key with full send access',
        '• Verify your sending domain at resend.com/domains',
        '• Use any verified email as From Address',
        '• Set up webhook at resend.com/webhooks → paste URL: <code>https://yourdomain.com/api/webhook/&lt;businessId&gt;/email</code>',
        '',
        'AWS SES (cheaper at scale):',
        '• Verify domain in SES Console',
        '• Exit sandbox mode (request production access)',
        '• Create IAM user with <code>ses:SendEmail</code> permission',
        '• Copy Access Key ID + Secret Access Key',
        '• Region defaults to ap-south-1 (Mumbai) — change if you use a different one',
      ],
    },
    instagram: {
      label: 'Facebook Graph API',
      url: 'https://developers.facebook.com/tools/explorer/',
      steps: [
        '1. Create a Facebook App with Instagram Basic Display',
        '2. Connect your Instagram Business account',
        '3. Generate a long-lived access token (60 days)',
        '4. Required scopes: instagram_basic, instagram_content_publish, pages_show_list',
      ],
    },
    google_ads: {
      label: 'Google Ads API Center',
      url: 'https://ads.google.com/aw/apicenter',
      steps: [
        '1. Apply for API access (takes 24-48h)',
        '2. Create OAuth credentials in Google Cloud Console',
        '3. Generate refresh token via OAuth flow',
        '4. Find Customer ID in Google Ads UI (top right)',
      ],
    },
    google_calendar: {
      label: 'Google Cloud Console',
      url: 'https://console.cloud.google.com/apis/credentials',
      steps: [
        '1. Enable Google Calendar API',
        '2. Create OAuth 2.0 credentials',
        '3. Generate refresh token via OAuth playground',
        '4. Calendar ID defaults to "primary"',
      ],
    },
    razorpay: {
      label: 'Razorpay Dashboard',
      url: 'https://dashboard.razorpay.com/app/keys',
      steps: [
        '1. Sign up at razorpay.com',
        '2. Go to Settings → API Keys',
        '3. Generate Live/Test keys',
        '4. Set up webhook in Settings → Webhooks',
      ],
    },
    openai: {
      label: 'OpenAI Dashboard',
      url: 'https://platform.openai.com/api-keys',
      steps: [
        '1. Sign up at platform.openai.com',
        '2. Add payment method (min $5)',
        '3. Create API key (starts with sk-)',
        '4. Skip this and use platform key if you\'re on Trial',
      ],
    },
    google_ai: {
      label: 'Google AI Studio',
      url: 'https://aistudio.google.com/app/apikey',
      steps: [
        '1. Free tier available (no credit card needed)',
        '2. Click "Get API key"',
        '3. Copy the key',
        '4. Free tier: 15 requests/min, 1500/day',
      ],
    },
  }

  const help = links[channel]
  if (!help) return null

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-teal-600 font-medium flex items-center gap-1">
        <ExternalLink className="w-3 h-3" />
        Where do I get these credentials?
      </summary>
      <div className="mt-2 p-3 bg-ink-50 rounded-lg space-y-2">
        {help.providerNote && (
          <p className="text-xs text-ink-600 italic">{help.providerNote}</p>
        )}
        <a href={help.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline block text-xs">
          Open {help.label} →
        </a>
        <div className="text-xs text-ink-700 space-y-0.5 whitespace-pre-line font-mono leading-relaxed">
          {help.steps.join('\n')}
        </div>
      </div>
    </details>
  )
}
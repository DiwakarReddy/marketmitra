'use client'

// TwoFactorSetupModal — real TOTP setup with QR code + 6-digit code entry.
// Replaces the old `prompt()`-based stub.

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { X, Shield, Loader2, Copy, CheckCircle2 } from 'lucide-react'

export function TwoFactorSetupModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'scan' | 'verify'>('scan')
  const [secret, setSecret] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [otpauth, setOtpauth] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // Initiate setup — fetch QR + secret
    fetch('/api/settings/2fa', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.qrCode && data.secret) {
          setQrCode(data.qrCode)
          setSecret(data.secret)
          setOtpauth(data.otpauth || '')
        } else {
          toast({ title: 'Could not start 2FA setup', description: data.error, variant: 'error' })
          onClose()
        }
        setLoading(false)
      })
      .catch((err) => {
        toast({ title: 'Setup failed', description: err.message, variant: 'error' })
        onClose()
      })
  }, [])

  const handleCodeChange = (idx: number, val: string) => {
    // Only accept digits
    const v = val.replace(/\D/g, '').slice(0, 1)
    const next = [...code]
    next[idx] = v
    setCode(next)
    // Auto-advance to next input
    if (v && idx < 5) {
      inputRefs.current[idx + 1]?.focus()
    }
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = pasted.split('').concat(Array(6).fill('')).slice(0, 6)
    setCode(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const verify = async () => {
    const codeStr = code.join('')
    if (codeStr.length !== 6) {
      toast({ title: 'Enter all 6 digits', variant: 'error' })
      return
    }
    setVerifying(true)
    try {
      const res = await fetch('/api/settings/2fa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeStr }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Invalid code')
      }
      toast({ title: '2FA enabled! 🔒', variant: 'success' })
      onSuccess()
    } catch (err: any) {
      toast({ title: 'Verification failed', description: err.message, variant: 'error' })
      // Clear code so user can retry
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setVerifying(false)
    }
  }

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast({ title: 'Secret copied', description: 'Paste in your authenticator if you cannot scan QR', variant: 'success' })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-bold text-ink-900">Enable 2FA</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-ink-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              Generating QR code…
            </div>
          ) : step === 'scan' ? (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Scan this QR code with Google Authenticator, Authy, or 1Password.
                Each time you log in, you'll need a 6-digit code from the app.
              </p>

              <div className="flex justify-center p-4 bg-white border-2 border-ink-200 rounded-xl">
                {qrCode && <img src={qrCode} alt="2FA QR code" className="w-56 h-56" />}
              </div>

              <div className="p-3 bg-ink-50 rounded-lg">
                <div className="text-xs font-medium text-ink-700 mb-1.5">Or enter the secret manually:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white border border-ink-200 rounded text-xs font-mono break-all">
                    {secret}
                  </code>
                  <Button size="sm" variant="outline" onClick={copySecret}>
                    {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              <Button variant="brand" className="w-full" onClick={() => setStep('verify')}>
                I've scanned the code — continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink-600">
                Enter the 6-digit code shown in your authenticator app to confirm.
              </p>

              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {code.map((digit, idx) => (
                  <Input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-12 h-14 text-center text-2xl font-bold font-mono"
                    autoFocus={idx === 0}
                    disabled={verifying}
                  />
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('scan')}>Back to QR</Button>
                <Button variant="brand" className="flex-1" onClick={verify} disabled={verifying || code.join('').length !== 6}>
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {verifying ? 'Verifying…' : 'Verify & enable'}
                </Button>
              </div>

              <p className="text-xs text-ink-500 text-center">
                Codes refresh every 30 seconds. Use the most recent one.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
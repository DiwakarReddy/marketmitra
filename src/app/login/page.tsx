'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Shield, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('priya@smilecare.demo')
  const [password, setPassword] = useState('demo1234')
  const [twoFactorCode, setTwoFactorCode] = useState(['', '', '', '', '', ''])
  const [needs2fa, setNeeds2fa] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleCodeChange = (idx: number, val: string) => {
    const v = val.replace(/\D/g, '').slice(0, 1)
    const next = [...twoFactorCode]
    next[idx] = v
    setTwoFactorCode(next)
    if (v && idx < 5) codeRefs.current[idx + 1]?.focus()
  }

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !twoFactorCode[idx] && idx > 0) {
      codeRefs.current[idx - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = pasted.split('').concat(Array(6).fill('')).slice(0, 6)
    setTwoFactorCode(next)
    codeRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!needs2fa) {
      // Step 1: precheck to see if 2FA is needed
      try {
        const pre = await fetch('/api/auth/precheck', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const preData = await pre.json()
        if (!preData.valid) {
          setError('Invalid email or password')
          setLoading(false)
          return
        }
        if (preData.needs2fa) {
          setNeeds2fa(true)
          setLoading(false)
          setTimeout(() => codeRefs.current[0]?.focus(), 100)
          return
        }
      } catch (err: any) {
        setError('Could not verify credentials. Try again.')
        setLoading(false)
        return
      }
    }

    // Step 2: actual signIn (with 2FA code if required)
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      // @ts-ignore — custom field passed to authorize()
      twoFactorCode: needs2fa ? twoFactorCode.join('') : undefined,
    })

    if (result?.error) {
      // Map known 2FA errors
      if (/INVALID_2FA_CODE/i.test(result.error)) {
        setError('Invalid 2FA code. Try again.')
        setTwoFactorCode(['', '', '', '', '', ''])
        codeRefs.current[0]?.focus()
      } else if (/2FA_MISCONFIGURED/i.test(result.error)) {
        setError('2FA is misconfigured on this account. Contact your admin.')
      } else {
        setError(needs2fa ? 'Invalid 2FA code. Try again.' : 'Invalid email or password')
      }
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-ink-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="text-center mb-6">
            <Link href="/" className="inline-flex items-center gap-2 mb-4">
              <div className="w-10 h-10 gradient-brand rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold">M</span>
              </div>
              <span className="font-bold text-ink-900 text-lg">MarketMitra</span>
            </Link>
            <h1 className="text-2xl font-bold text-ink-900">Welcome back</h1>
            <p className="text-sm text-ink-500 mt-1">Sign in to manage your AI marketing</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={needs2fa}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={needs2fa}
              />
              {needs2fa && (
                <button
                  type="button"
                  onClick={() => { setNeeds2fa(false); setTwoFactorCode(['', '', '', '', '', '']); setError('') }}
                  className="text-xs text-teal-700 hover:underline mt-1.5"
                >
                  ← Use a different account
                </button>
              )}
            </div>

            {needs2fa && (
              <div>
                <label className="text-xs font-medium text-ink-700 mb-1.5 block flex items-center gap-1">
                  <Shield className="w-3 h-3 text-teal-600" />
                  2FA code from your authenticator app
                </label>
                <div className="flex gap-2 justify-center" onPaste={handleCodePaste}>
                  {twoFactorCode.map((digit, idx) => (
                    <Input
                      key={idx}
                      ref={(el) => { codeRefs.current[idx] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleCodeChange(idx, e.target.value)}
                      onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                      className="w-10 h-12 text-center text-xl font-bold font-mono"
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}

            <Button type="submit" variant="brand" className="w-full" disabled={loading || (needs2fa && twoFactorCode.join('').length !== 6)}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Signing in...' : needs2fa ? 'Verify & sign in' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-ink-500">
            Don't have an account?{' '}
            <Link href="/signup" className="text-teal-700 font-medium hover:underline">
              Sign up free
            </Link>
          </div>

          <div className="mt-6 p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-ink-700">
            <strong>Demo:</strong> priya@smilecare.demo / demo1234
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
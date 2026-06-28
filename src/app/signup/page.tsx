'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    city: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Signup failed')
        setLoading(false)
        return
      }

      // Auto-login
      const { signIn } = await import('next-auth/react')
      await signIn('credentials', { email: form.email, password: form.password, redirect: false })
      router.push('/onboarding')
      router.refresh()
    } catch (err) {
      setError('Something went wrong')
      setLoading(false)
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
            <h1 className="text-2xl font-bold text-ink-900">Start your free trial</h1>
            <p className="text-sm text-ink-500 mt-1">14 days free. No credit card needed.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input type="password" placeholder="Password (min 8 chars)" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <Input placeholder="Business name" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required />
            <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
            <Input placeholder="Phone (with country code)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />

            {error && <div className="text-sm text-red-600">{error}</div>}

            <Button type="submit" variant="brand" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link href="/login" className="text-teal-700 font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('priya@smilecare.demo')
  const [password, setPassword] = useState('demo1234')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
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
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <Button type="submit" variant="brand" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
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
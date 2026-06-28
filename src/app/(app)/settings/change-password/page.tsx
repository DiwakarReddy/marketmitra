'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import { Lock, Save, Loader2, Check } from 'lucide-react'

export default function ChangePasswordPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })

  const submit = async () => {
    if (form.newPassword.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'error' })
      return
    }
    if (form.newPassword !== form.confirm) {
      toast({ title: 'Passwords do not match', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: 'Password changed', variant: 'success' })
      setForm({ currentPassword: '', newPassword: '', confirm: '' })
      setTimeout(() => router.push('/settings'), 1500)
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const strength = (pw: string) => {
    let s = 0
    if (pw.length >= 8) s++
    if (pw.length >= 12) s++
    if (/[A-Z]/.test(pw)) s++
    if (/[0-9]/.test(pw)) s++
    if (/[^A-Za-z0-9]/.test(pw)) s++
    return s
  }
  const score = strength(form.newPassword)
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-500', 'bg-amber-400', 'bg-green-500', 'bg-green-600']

  return (
    <div className="max-w-md mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 flex items-center gap-2">
          <Lock className="w-6 h-6 text-teal-600" />
          Change password
        </h1>
        <p className="text-ink-600 mt-1 text-sm">Use a strong password with 8+ characters, mixed case, numbers, and symbols.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Current password</label>
            <Input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">New password</label>
            <Input
              type="password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            />
            {form.newPassword && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full ${i <= score ? colors[score] : 'bg-ink-100'}`} />
                  ))}
                </div>
                <div className="text-xs text-ink-500">{labels[score]}</div>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Confirm new password</label>
            <Input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
            {form.confirm && form.newPassword === form.confirm && (
              <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" />Passwords match
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/settings')}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving' : 'Change password'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
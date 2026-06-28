'use client'

// Add a single customer — opens a modal, posts to /api/customers (single-customer path)

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Plus, X, Loader2, User, Phone, Mail, Cake, Heart } from 'lucide-react'

export function AddCustomerButton() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    language: 'hinglish',
    birthday: '',
    anniversary: '',
    tags: '',
    notes: '',
  })

  const reset = () => {
    setForm({ name: '', phone: '', email: '', language: 'hinglish', birthday: '', anniversary: '', tags: '', notes: '' })
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', variant: 'error' })
      return
    }
    if (!form.phone.trim() || form.phone.replace(/\D/g, '').length < 10) {
      toast({ title: 'Valid phone number required', variant: 'error' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          language: form.language,
          birthday: form.birthday || undefined,
          anniversary: form.anniversary || undefined,
          tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
          notes: form.notes.trim() || undefined,
          source: 'manual',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save')

      // Refresh the page to show the new customer in the list
      toast({ title: 'Customer added', variant: 'success' })
      reset()
      setOpen(false)
      // Hard reload to fetch new data
      setTimeout(() => window.location.reload(), 500)
    } catch (err: any) {
      toast({ title: 'Failed to add customer', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" />
        Add customer
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <Card className="max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-teal-600" />
                  Add customer
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="रिया शर्मा"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">
                    WhatsApp / Phone <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder="98765 43210"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    placeholder="riya@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block">Language</label>
                  <select
                    className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    <option value="hinglish">Hinglish</option>
                    <option value="hi">Hindi</option>
                    <option value="en">English</option>
                    <option value="ta">Tamil</option>
                    <option value="te">Telugu</option>
                    <option value="bn">Bengali</option>
                    <option value="mr">Marathi</option>
                    <option value="gu">Gujarati</option>
                    <option value="pa">Punjabi</option>
                    <option value="kn">Kannada</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block flex items-center gap-1">
                    <Cake className="w-3 h-3" /> Birthday
                  </label>
                  <Input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-700 mb-1.5 block flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Anniversary
                  </label>
                  <Input
                    type="date"
                    value={form.anniversary}
                    onChange={(e) => setForm({ ...form, anniversary: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700 mb-1.5 block">Tags (comma-separated)</label>
                <Input
                  placeholder="vip, returning, kids"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-700 mb-1.5 block">Internal notes</label>
                <textarea
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[80px]"
                  placeholder="Prefers morning slots, kids with her..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="brand" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Add customer'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
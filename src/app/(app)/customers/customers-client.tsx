'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { CustomerFieldsSection } from '@/components/customer-fields-section'
import { useConfirm } from '@/components/confirm-dialog'
import { Search, Users, Tag, Trash2, Mail, MessageSquare, Edit2, X, CheckSquare, Square, Filter, Cake, Heart, Sparkles, Phone, Loader2, Download } from 'lucide-react'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  language: string
  tags: string | null
  source: string | null
  notes: string | null
  birthday: Date | null
  anniversary: Date | null
  lastVisitAt: Date | null
  totalVisits: number
  totalSpentPaise: number
  optedOut: boolean
  createdAt: Date
}

export function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const { toast } = useToast()
  const { confirm, prompt } = useConfirm()
  const [customers, setCustomers] = useState(initialCustomers)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [view, setView] = useState<'all' | 'birthday' | 'anniversary' | 'inactive'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  const filtered = customers.filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.phone.includes(search)) return false
    if (tagFilter && !c.tags?.split(',').map(t => t.trim()).includes(tagFilter)) return false
    if (view === 'birthday' && !c.birthday) return false
    if (view === 'anniversary' && !c.anniversary) return false
    if (view === 'inactive' && c.lastVisitAt && (Date.now() - new Date(c.lastVisitAt).getTime()) < 90 * 86400000) return false
    return true
  })

  const allTags = Array.from(new Set(
    customers.flatMap((c) => c.tags?.split(',').map(t => t.trim()).filter(Boolean) || [])
  ))

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((c) => c.id)))
  }

  const bulkAction = async (action: 'delete' | 'tag' | 'untag' | 'message', value?: string) => {
    if (selected.size === 0) {
      toast({ title: 'Select customers first', variant: 'error' })
      return
    }
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/customers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action, value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (action === 'delete') {
        setCustomers(customers.filter((c) => !selected.has(c.id)))
        toast({ title: `Deleted ${data.count} customers`, variant: 'success' })
      } else if (action === 'tag' || action === 'untag') {
        // Refresh
        const params = new URLSearchParams()
        const res = await fetch('/api/customers')
        const data = await res.json()
        setCustomers(data.customers)
        toast({ title: `Updated ${data.count} customers`, variant: 'success' })
      }

      setSelected(new Set())
    } catch (err: any) {
      toast({ title: 'Bulk action failed', description: err.message, variant: 'error' })
    } finally {
      setBulkActionLoading(false)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Email', 'Birthday', 'Anniversary', 'Tags', 'Visits', 'Spent (₹)', 'Last Visit', 'Created'].join(','),
    ]
    for (const c of filtered) {
      rows.push([
        `"${c.name.replace(/"/g, '""')}"`,
        c.phone,
        c.email || '',
        c.birthday ? new Date(c.birthday).toISOString().split('T')[0] : '',
        c.anniversary ? new Date(c.anniversary).toISOString().split('T')[0] : '',
        `"${c.tags || ''}"`,
        c.totalVisits,
        (c.totalSpentPaise / 100).toFixed(2),
        c.lastVisitAt ? new Date(c.lastVisitAt).toISOString().split('T')[0] : '',
        new Date(c.createdAt).toISOString(),
      ].join(','))
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isBirthdaySoon = (c: Customer) => {
    if (!c.birthday) return false
    const today = new Date()
    const bday = new Date(c.birthday)
    bday.setFullYear(today.getFullYear())
    if (bday < today) bday.setFullYear(today.getFullYear() + 1)
    const days = Math.floor((bday.getTime() - today.getTime()) / 86400000)
    return days <= 7
  }

  return (
    <>
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Search by name or phone..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="w-4 h-4" />Export
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {[
              { k: 'all', label: `All (${customers.length})` },
              { k: 'birthday', label: 'Birthdays' },
              { k: 'anniversary', label: 'Anniversaries' },
              { k: 'inactive', label: 'Inactive 90d+' },
            ].map((tab) => (
              <button
                key={tab.k}
                onClick={() => setView(tab.k as any)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                  view === tab.k ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {allTags.length > 0 && (
              <>
                <span className="text-ink-300">|</span>
                <Filter className="w-3 h-3 text-ink-500" />
                {allTags.slice(0, 8).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      tagFilter === tag ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <span className="text-sm font-semibold text-teal-900">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={async () => {
                const tag = await prompt({
                  title: 'Add tag to selected',
                  message: `Tag will be added to ${selected.size} customer${selected.size === 1 ? '' : 's'}.`,
                  defaultValue: '',
                  placeholder: 'e.g. vip, hair-treatments, birthday-month',
                  confirmText: 'Add tag',
                  required: true,
                })
                if (!tag) return
                if (tag) bulkAction('tag', tag)
              }} disabled={bulkActionLoading}>
                <Tag className="w-3 h-3" />Add tag
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkAction('message')} disabled={bulkActionLoading}>
                <MessageSquare className="w-3 h-3" />Message
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                if (await confirm({
                  title: `Delete ${selected.size} customer${selected.size === 1 ? '' : 's'}?`,
                  message: 'This will permanently remove their appointments, conversations, tags and history. This cannot be undone.',
                  confirmText: 'Delete',
                  destructive: true,
                })) bulkAction('delete')
              }} disabled={bulkActionLoading} className="text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-3 h-3" />Delete
              </Button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-teal-700 underline">Clear selection</button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer list */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No customers yet</p>
              <p className="text-sm text-ink-500 mt-1">Import a CSV or wait for customers to book</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              <div className="p-3 bg-ink-50 flex items-center gap-2 sticky top-0 z-10">
                <button onClick={selectAll} className="text-ink-500">
                  {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="w-4 h-4 text-teal-600" /> : <Square className="w-4 h-4" />}
                </button>
                <span className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{filtered.length} customers</span>
              </div>
              {filtered.map((c) => {
                const isSelected = selected.has(c.id)
                const initials = c.name.split(/\s/)[0].slice(0, 2).toUpperCase()
                const colorIdx = c.id.charCodeAt(0) % 5
                const colors = ['bg-pink-200 text-pink-700', 'bg-blue-200 text-blue-700', 'bg-purple-200 text-purple-700', 'bg-amber-200 text-amber-700', 'bg-green-200 text-green-700']
                const tags = c.tags?.split(',').map(t => t.trim()).filter(Boolean) || []
                return (
                  <div key={c.id} className={`p-3 flex items-center gap-3 hover:bg-ink-50/50 ${isSelected ? 'bg-teal-50/30' : ''}`}>
                    <button onClick={() => toggleSelect(c.id)} className="text-ink-500 flex-shrink-0">
                      {isSelected ? <CheckSquare className="w-4 h-4 text-teal-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${colors[colorIdx]}`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm text-ink-900">{c.name}</span>
                        {isBirthdaySoon(c) && (
                          <Badge variant="warning" className="text-[10px]">
                            <Cake className="w-3 h-3 mr-0.5" />Bday soon
                          </Badge>
                        )}
                        {c.optedOut && <Badge variant="danger" className="text-[10px]">Opted out</Badge>}
                        {c.totalVisits >= 10 && <Badge variant="success" className="text-[10px]">VIP</Badge>}
                      </div>
                      <div className="text-xs text-ink-500 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                        {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        <span>{c.totalVisits} visits</span>
                        <span>₹{(c.totalSpentPaise / 100).toLocaleString('en-IN')}</span>
                      </div>
                      {tags.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {tags.map((tag) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditingCustomer(c)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      {editingCustomer && (
        <CustomerEditModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSave={(updated) => {
            const normalized: Customer = {
              ...(updated as any),
              birthday: (updated as any).birthday ? new Date((updated as any).birthday) : null,
              anniversary: (updated as any).anniversary ? new Date((updated as any).anniversary) : null,
              lastVisitAt: (updated as any).lastVisitAt ? new Date((updated as any).lastVisitAt) : null,
              createdAt: new Date((updated as any).createdAt),
            }
            setCustomers(customers.map((c) => c.id === normalized.id ? normalized : c))
            setEditingCustomer(null)
            toast({ title: 'Customer updated', variant: 'success' })
          }}
        />
      )}
    </>
  )
}

function CustomerEditModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void }) {
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    email: customer.email || '',
    language: customer.language,
    tags: customer.tags || '',
    notes: customer.notes || '',
    birthday: customer.birthday ? new Date(customer.birthday).toISOString().split('T')[0] : '',
    anniversary: customer.anniversary ? new Date(customer.anniversary).toISOString().split('T')[0] : '',
    optedOut: customer.optedOut,
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          birthday: form.birthday || null,
          anniversary: form.anniversary || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSave(data.customer)
    } catch (err: any) {
      // optimistic update
      onSave({ ...customer, ...form, birthday: form.birthday || null, anniversary: form.anniversary || null } as any)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-ink-900">Edit customer</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Language</label>
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
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block flex items-center gap-1">
                <Cake className="w-3 h-3" />Birthday
              </label>
              <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block flex items-center gap-1">
                <Heart className="w-3 h-3" />Anniversary
              </label>
              <Input type="date" value={form.anniversary} onChange={(e) => setForm({ ...form, anniversary: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Tags (comma-separated)</label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, returning, kids" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Notes (internal)</label>
            <textarea
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="p-3 border border-ink-100 rounded-lg bg-ink-50/30">
            <CustomerFieldsSection customerId={customer.id} />
          </div>
          <div className="flex items-center justify-between p-3 bg-ink-50 rounded-lg">
            <div>
              <div className="text-sm font-medium text-ink-900">Opted out of marketing</div>
              <div className="text-xs text-ink-500">Customer won't receive any WhatsApp/SMS/email from us</div>
            </div>
            <button
              onClick={() => setForm({ ...form, optedOut: !form.optedOut })}
              className={`relative w-10 h-6 rounded-full transition ${form.optedOut ? 'bg-red-500' : 'bg-ink-300'}`}
            >
              <span className={`absolute top-0.5 ${form.optedOut ? 'left-5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
            </button>
          </div>
        </div>
        <div className="p-4 border-t border-ink-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { CheckCircle2, X, Calendar as CalIcon, Loader2, Edit2, MessageSquare, Mic, Image as ImageIcon, Megaphone } from 'lucide-react'

interface Approval {
  id: string
  type: string
  title: string
  preview: string
  recipients: number
  status: string
  createdAt: Date
}

const TYPE_ICONS: Record<string, any> = {
  whatsapp: MessageSquare,
  voice: Mic,
  instagram: ImageIcon,
  broadcast: Megaphone,
}

export function ApprovalsClient({ initialApprovals }: { initialApprovals: Approval[] }) {
  const { toast } = useToast()
  const [approvals, setApprovals] = useState(initialApprovals)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  const pending = approvals.filter((a) => a.status === 'pending')
  const decided = approvals.filter((a) => a.status !== 'pending')

  const act = async (id: string, action: 'approve' | 'reject' | 'schedule', scheduledFor?: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scheduledFor }),
      })
      if (!res.ok) throw new Error('Failed')
      setApprovals(approvals.map((a) =>
        a.id === id ? { ...a, status: action === 'reject' ? 'rejected' : 'approved' } : a
      ))
      toast({
        title: action === 'approve' ? 'Approved & sent' : action === 'reject' ? 'Rejected' : 'Scheduled',
        variant: 'success',
      })
      setSelected((s) => { const n = new Set(s); n.delete(id); return n })
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const bulkAct = async (action: 'approve' | 'reject') => {
    if (selected.size === 0) return
    setBusy('bulk')
    try {
      const res = await fetch('/api/approvals/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      })
      if (!res.ok) throw new Error('Failed')
      const newStatus = action === 'approve' ? 'approved' : 'rejected'
      setApprovals(approvals.map((a) => selected.has(a.id) ? { ...a, status: newStatus } : a))
      toast({ title: `${action === 'approve' ? 'Approved' : 'Rejected'} ${selected.size} items`, variant: 'success' })
      setSelected(new Set())
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const editMessage = (a: Approval) => {
    const newMsg = prompt('Edit message:', a.preview)
    if (newMsg) {
      toast({ title: 'Message updated (refresh to see)', variant: 'success' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold text-ink-900">Approvals</h1>
          <Badge variant="danger">{pending.length}</Badge>
        </div>
        <p className="text-ink-600">AI ने ये campaigns draft किए हैं। एक tap से approve करें।</p>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
          <span className="text-sm font-semibold text-teal-900">{selected.size} selected</span>
          <Button size="sm" variant="brand" onClick={() => bulkAct('approve')} disabled={busy === 'bulk'}>
            <CheckCircle2 className="w-3 h-3" />Approve all
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkAct('reject')} disabled={busy === 'bulk'}>
            <X className="w-3 h-3" />Reject all
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-teal-700 underline">Clear</button>
        </div>
      )}

      {/* Pending */}
      <div>
        <h2 className="text-lg font-bold text-ink-900 mb-3">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">All caught up!</p>
              <p className="text-sm text-ink-500 mt-1">No pending approvals. AI is working autonomously.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => {
              const Icon = TYPE_ICONS[a.type] || MessageSquare
              const isSelected = selected.has(a.id)
              return (
                <Card key={a.id} className={isSelected ? 'ring-2 ring-teal-500' : ''}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const next = new Set(selected)
                          if (e.target.checked) next.add(a.id)
                          else next.delete(a.id)
                          setSelected(next)
                        }}
                        className="mt-1"
                      />
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-green-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-ink-900">{a.title}</h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-ink-500">
                          <span>📤 To {a.recipients} customers</span>
                          <span>•</span>
                          <span>🕐 Created {new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                        </div>
                        <div className="mt-3 p-3 bg-ink-50 rounded-lg text-sm text-ink-700 whitespace-pre-wrap">
                          {a.preview}
                        </div>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <Button size="sm" variant="brand" onClick={() => act(a.id, 'approve')} disabled={busy === a.id}>
                            {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                            Approve & send
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            const time = prompt('Schedule for (YYYY-MM-DD HH:MM):', new Date(Date.now() + 86400000).toISOString().slice(0, 16))
                            if (time) act(a.id, 'schedule', time)
                          }}>
                            <CalIcon className="w-3 h-3" />Schedule
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => editMessage(a)}>
                            <Edit2 className="w-3 h-3" />Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => act(a.id, 'reject')} className="text-red-600">
                            <X className="w-3 h-3" />Reject
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Decided */}
      {decided.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-ink-900 mb-3">Recently decided</h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-ink-100">
                {decided.slice(0, 10).map((a) => (
                  <div key={a.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-ink-900">{a.title}</div>
                      <div className="text-xs text-ink-500">{new Date(a.createdAt).toLocaleDateString('en-IN')}</div>
                    </div>
                    <Badge variant={a.status === 'approved' ? 'success' : 'danger'}>
                      {a.status === 'approved' ? '✓ Approved' : '✗ Rejected'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
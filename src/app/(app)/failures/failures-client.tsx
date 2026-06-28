'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { RefreshCw, AlertCircle, CheckCircle2, Loader2, Trash2, BarChart3 } from 'lucide-react'

interface Failure {
  id: string
  phone: string
  message: string
  type: string
  provider: string
  error: string
  attempts: number
  status: string
  lastAttemptAt: Date
  nextAttemptAt: Date | null
  createdAt: Date
}

export function FailuresClient({ initialFailures, stats }: { initialFailures: Failure[]; stats: { total: number; resolved: number; byType: any[] } }) {
  const { toast } = useToast()
  const [failures, setFailures] = useState(initialFailures)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const retry = async (id: string) => {
    setRetrying(id)
    try {
      const res = await fetch(`/api/failures/${id}/retry`, { method: 'POST' })
      const data = await res.json()
      if (data.sent) {
        setFailures(failures.filter((f) => f.id !== id))
        toast({ title: 'Resent successfully', variant: 'success' })
      } else {
        setFailures(failures.map((f) => f.id === id ? { ...f, attempts: f.attempts + 1, error: data.error } : f))
        toast({ title: 'Still failing', description: data.error, variant: 'error' })
      }
    } catch (err: any) {
      toast({ title: 'Retry failed', description: err.message, variant: 'error' })
    } finally {
      setRetrying(null)
    }
  }

  const retryAll = async () => {
    for (const f of failures) {
      await retry(f.id)
    }
  }

  const resolutionRate = stats.total > 0 ? Math.round(stats.resolved / stats.total * 100) : 0

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">Failed Messages</h1>
          <p className="text-ink-600 mt-1">AI auto-retries with exponential backoff. You can also retry manually.</p>
        </div>
        {failures.length > 0 && (
          <Button variant="brand" onClick={retryAll}>
            <RefreshCw className="w-4 h-4" />Retry all
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Total failures</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Resolved</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Resolution rate</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{resolutionRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Pending</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{failures.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Error breakdown */}
      {stats.byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Failure causes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.byType.map((t) => (
                <div key={t.error} className="flex items-center justify-between text-sm">
                  <span className="text-ink-700 truncate flex-1">{t.error || 'Unknown'}</span>
                  <Badge variant="danger">{t._count.id}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failure list */}
      <Card>
        <CardHeader>
          <CardTitle>Pending messages ({failures.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {failures.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No pending failures 🎉</p>
              <p className="text-sm text-ink-500 mt-1">All messages delivered successfully</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {failures.map((f) => (
                <div key={f.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink-900">+{f.phone}</span>
                        <Badge variant="warning">Attempt {f.attempts}/6</Badge>
                        <Badge variant={f.status === 'dead' ? 'danger' : 'secondary'}>{f.status}</Badge>
                      </div>
                      <div className="text-xs text-ink-500 mt-1">
                        {new Date(f.createdAt).toLocaleString('en-IN')}
                      </div>
                      <div className="mt-2 p-2 bg-ink-50 rounded text-sm text-ink-700 max-h-20 overflow-y-auto">
                        {f.message}
                      </div>
                      <div className="mt-2 text-xs text-red-700">
                        <strong>Error:</strong> {f.error}
                      </div>
                      {f.nextAttemptAt && f.status !== 'dead' && (
                        <div className="text-xs text-ink-500 mt-1">
                          Next auto-retry: {new Date(f.nextAttemptAt).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="brand" onClick={() => retry(f.id)} disabled={retrying === f.id}>
                        {retrying === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Retry now
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => {
                        if (!confirm('Mark as dead (give up)?')) return
                        await fetch(`/api/failures/${f.id}`, { method: 'DELETE' })
                        setFailures(failures.filter((x) => x.id !== f.id))
                      }}>
                        <Trash2 className="w-3 h-3" />Give up
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
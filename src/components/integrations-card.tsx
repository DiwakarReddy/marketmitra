'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { canConnectChannel } from '@/lib/plan-features'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Zap, CheckCircle2, XCircle, Loader2, Settings as SettingsIcon, Trash2, Send, Clock, KeyRound, Shield, AlertTriangle } from 'lucide-react'
import { CredentialsModal } from '@/components/credentials-modal'

interface ChannelData {
  channel: string
  label: string
  icon: string
  description: string
  providers?: { value: string; label: string }[]
  fields: { key: string; label: string; type: string; required: boolean; placeholder?: string; helpText?: string }[]
  testInstructions?: string
  connected: boolean
  provider?: string | null
  config: Record<string, any>
  hasCredentials: boolean
  lastTestedAt?: Date | null
  lastTestStatus?: string
  lastTestError?: string
  connectedAt?: Date | null
  displayValues?: Record<string, string>
  keyVersion?: number
  lastUsedAt?: Date | null
  lastRotatedAt?: Date | null
  ageDays?: number | null
}

export function IntegrationsCard({ onChange }: { onChange: () => void }) {
  const { toast } = useToast()
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingChannel, setEditingChannel] = useState<ChannelData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [sendingTest, setSendingTest] = useState<string | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testMessage, setTestMessage] = useState('🙏 Hi! This is a test message from MarketMitra. If you received this, your WhatsApp integration is working correctly!')
  const [userPlan, setUserPlan] = useState<string>('trial')

  useEffect(() => {
    fetch('/api/me/business').then((r) => r.json()).then((d) => {
      if (d?.business?.plan) setUserPlan(d.business.plan)
    })
  }, [])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/channels')
      const data = await res.json()
      setChannels(data.channels)
    } finally { setLoading(false) }
  }

  const disconnect = async (channel: string) => {
    if (!confirm(`Disconnect ${channel}?`)) return
    setBusy(channel)
    try {
      await fetch(`/api/channels/${channel}`, { method: 'DELETE' })
      await load()
      onChange()
    } finally { setBusy(null) }
  }

  const sendTest = async (channel: string) => {
    if (!testPhone.match(/^\+\d{10,15}$/)) {
      toast({ title: 'Phone must be in E.164 format', description: 'e.g. +919876543210', variant: 'error' })
      return
    }
    setSendingTest(channel)
    try {
      const res = await fetch(`/api/channels/${channel}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone, message: testMessage }),
      })
      const data = await res.json()
      if (res.ok && data.sent) {
        toast({
          title: 'Test message sent!',
          description: data.mocked ? 'In mock mode (no real WhatsApp configured)' : `Delivered via ${data.provider}`,
          variant: 'success',
        })
      } else {
        toast({ title: 'Send failed', description: data.error || 'Unknown error', variant: 'error' })
      }
    } catch (err: any) {
      toast({ title: 'Test failed', description: err.message, variant: 'error' })
    } finally {
      setSendingTest(null)
    }
  }

  const connectedCount = channels.filter((c) => c.connected).length
  const channelColor: Record<string, string> = {
    whatsapp: 'bg-green-100', voice: 'bg-purple-100', instagram: 'bg-pink-100',
    google_ads: 'bg-blue-100', google_calendar: 'bg-blue-100', razorpay: 'bg-indigo-100',
    openai: 'bg-emerald-100', google_ai: 'bg-amber-100',
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-teal-600" />
              Integrations
            </span>
            <Badge variant={connectedCount > 0 ? 'success' : 'secondary'}>
              {connectedCount}/{channels.length} connected
            </Badge>
          </CardTitle>
          <div className="text-sm text-ink-500 mt-2 flex items-center gap-1">
            <Shield className="w-3 h-3" />
            🔒 Credentials are AES-256-GCM encrypted + per-tenant isolated. Last-used + audit log tracked.
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-ink-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            channels.map((c) => {
              const needsRotation = c.ageDays !== null && c.ageDays !== undefined && c.ageDays > 90
              const canTestSend = c.channel === 'whatsapp' // Only WhatsApp for now
              const inPlan = canConnectChannel(userPlan, c.channel as any)
              if (!inPlan) return null // Hide channels not in plan

              return (
                <div key={c.channel} className={`p-3 border rounded-lg transition ${needsRotation ? 'border-amber-200 bg-amber-50/30' : 'border-ink-100'} hover:bg-ink-50/30`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 ${channelColor[c.channel] || 'bg-ink-100'} rounded-lg flex items-center justify-center text-xl flex-shrink-0`}>
                        {c.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-ink-900">{c.label}</span>
                          {c.connected && (c.channel === 'whatsapp' || c.channel === 'voice') && (
                            <PerTenantWebhookUrl channel={c.channel as any} />
                          )}
                          {c.connected ? (
                            <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-0.5" />Connected</Badge>
                          ) : (
                            <Badge variant="secondary"><XCircle className="w-3 h-3 mr-0.5" />Not connected</Badge>
                          )}
                          {c.lastTestStatus === 'failed' && <Badge variant="danger">Test failed</Badge>}
                          {c.keyVersion && c.keyVersion > 1 && (
                            <Badge variant="outline" className="text-[10px]">
                              <KeyRound className="w-3 h-3 mr-0.5" />v{c.keyVersion}
                            </Badge>
                          )}
                          {needsRotation && (
                            <Badge variant="warning" title={`Last rotated ${c.ageDays} days ago`}>
                              <AlertTriangle className="w-3 h-3 mr-0.5" />Rotate ({c.ageDays}d)
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-ink-500 truncate">
                          {c.connected && c.displayValues
                            ? Object.entries(c.displayValues).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' • ')
                            : c.description
                          }
                        </div>
                        {c.connected && (
                          <div className="flex items-center gap-3 text-[10px] text-ink-500 mt-1">
                            {c.lastUsedAt && (
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />Last used {timeAgo(new Date(c.lastUsedAt))}
                              </span>
                            )}
                            {c.lastRotatedAt && (
                              <span>Rotated {timeAgo(new Date(c.lastRotatedAt))}</span>
                            )}
                          </div>
                        )}
                        {c.lastTestError && (
                          <div className="text-xs text-red-600 mt-0.5">⚠️ {c.lastTestError}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.connected ? (
                        <>
                          {canTestSend && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTestingChannel(testingChannel === c.channel ? null : c.channel)}
                            >
                              <Send className="w-3 h-3" />Test
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setEditingChannel(c)}>
                            <SettingsIcon className="w-3 h-3" />Manage
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => disconnect(c.channel)}
                            disabled={busy === c.channel}
                            className="text-red-600"
                          >
                            {busy === c.channel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="brand" onClick={() => setEditingChannel(c)}>
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Test send form */}
                  {testingChannel === c.channel && canTestSend && (
                    <div className="mt-3 pt-3 border-t border-ink-100 space-y-2">
                      <Input
                        type="tel"
                        placeholder="+919876543210"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        className="text-sm"
                      />
                      <textarea
                        className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[60px]"
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setTestingChannel(null)}>Cancel</Button>
                        <Button
                          size="sm"
                          variant="brand"
                          onClick={() => sendTest(c.channel)}
                          disabled={sendingTest === c.channel}
                        >
                          {sendingTest === c.channel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          {sendingTest === c.channel ? 'Sending…' : 'Send test'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {editingChannel && (
        <CredentialsModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSaved={() => { load(); onChange() }}
        />
      )}
    </>
  )
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
function PerTenantWebhookUrl({ channel }: { channel: 'whatsapp' | 'voice' }) {
  const [copied, setCopied] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me/business').then((r) => r.json()).then((d) => {
      if (d?.business?.id) setBusinessId(d.business.id)
    })
  }, [])

  if (!businessId) return null

  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://app.marketmitra.com'}/api/webhook/${businessId}/${channel}`

  const copy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-2 p-2 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2">
      <code className="text-xs text-teal-800 flex-1 truncate font-mono">{url}</code>
      <button
        onClick={copy}
        className="text-xs px-2 py-1 bg-white border border-teal-300 rounded text-teal-700 hover:bg-teal-100"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

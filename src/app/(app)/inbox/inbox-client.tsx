'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { Send, AlertCircle, CheckCircle2, Sparkles, Search, Tag, StickyNote, Phone, Mail, Calendar, UserCircle, Loader2, ArrowLeft } from 'lucide-react'

interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  totalVisits: number
  totalSpentPaise: number
  lastVisitAt: Date | null
}

interface Message {
  id: string
  direction: string
  sender: string
  content: string
  createdAt: Date
}

interface Conversation {
  id: string
  status: string
  lastMessageAt: Date
  aiActive: boolean
  unreadCount: number
  internalNotes: string | null
  labels: string | null
  customer: Customer
  messages: Message[]
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  ai_handling: { label: 'AI handling', bg: 'bg-green-100', text: 'text-green-700' },
  human_handling: { label: 'You', bg: 'bg-blue-100', text: 'text-blue-700' },
  booked: { label: 'Booked', bg: 'bg-teal-100', text: 'text-teal-700' },
  needs_human: { label: 'Needs you', bg: 'bg-red-100', text: 'text-red-700' },
  resolved: { label: 'Resolved', bg: 'bg-ink-100', text: 'text-ink-700' },
  ai_replied: { label: 'AI replied', bg: 'bg-green-100', text: 'text-green-700' },
}

const QUICK_REPLIES = [
  'Send booking confirmation',
  'Send clinic location',
  'Send price list',
  'Send tomorrow reminder',
  'Connect with doctor',
  'Reschedule',
]

const PRESET_LABELS = ['vip', 'high-value', 'complaint', 'follow-up', 'new', 'returning', 'insurance', 'kids']

export function InboxClient({
  initialConversations,
  initialCounts,
}: {
  initialConversations: Conversation[]
  initialCounts: { all: number; ai: number; booked: number; needs: number; unread: number; today: number }
}) {
  const { toast } = useToast()
  const [conversations, setConversations] = useState(initialConversations)
  const [counts, setCounts] = useState(initialCounts)
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id || null)
  const [view, setView] = useState<'all' | 'unread' | 'today' | 'ai' | 'booked' | 'needs'>('all')
  const [search, setSearch] = useState('')
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selected = conversations.find((c) => c.id === selectedId)

  // Filter conversations client-side
  const filtered = conversations.filter((c) => {
    if (search && !c.customer.name.toLowerCase().includes(search.toLowerCase()) && !c.customer.phone.includes(search)) return false
    if (view === 'unread' && c.unreadCount === 0) return false
    if (view === 'today' && new Date(c.lastMessageAt) < new Date(new Date().setHours(0, 0, 0, 0))) return false
    if (view === 'ai' && c.status !== 'ai_handling') return false
    if (view === 'booked' && c.status !== 'booked') return false
    if (view === 'needs' && c.status !== 'needs_human') return false
    return true
  })

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedId) return
    const loadMessages = async () => {
      const res = await fetch(`/api/inbox/${selectedId}`)
      const data = await res.json()
      if (data.conversation) {
        setActiveConv(data.conversation)
        setMessages(data.conversation.messages)
        setNotes(data.conversation.internalNotes || '')
        setLabelInput(data.conversation.labels || '')
      }
    }
    loadMessages()
  }, [selectedId])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (view !== 'all') params.set('view', view)
      const res = await fetch(`/api/inbox?${params}`)
      const data = await res.json()
      if (data.conversations) {
        setConversations(data.conversations)
        setCounts(data.counts)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [search, view])

  const sendMessage = async () => {
    if (!selectedId || !input.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/inbox/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })
      if (!res.ok) throw new Error('Failed to send')
      const newMsg: Message = {
        id: 'temp-' + Date.now(),
        direction: 'outbound',
        sender: 'human',
        content: input,
        createdAt: new Date(),
      }
      setMessages([...messages, newMsg])
      setInput('')
      toast({ title: 'Message sent', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err.message, variant: 'error' })
    } finally {
      setSending(false)
    }
  }

  const takeOver = async () => {
    if (!selectedId) return
    await fetch(`/api/inbox/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiActive: false, status: 'human_handling' }),
    })
    setActiveConv(activeConv ? { ...activeConv, aiActive: false, status: 'human_handling' } : null)
    toast({ title: 'AI paused for this chat. You are now replying.', variant: 'success' })
  }

  const releaseToAI = async () => {
    if (!selectedId) return
    await fetch(`/api/inbox/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiActive: true, status: 'ai_handling' }),
    })
    setActiveConv(activeConv ? { ...activeConv, aiActive: true, status: 'ai_handling' } : null)
    toast({ title: 'AI is back in control', variant: 'success' })
  }

  const saveNotes = async () => {
    if (!selectedId) return
    await fetch(`/api/inbox/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internalNotes: notes }),
    })
    toast({ title: 'Notes saved', variant: 'success' })
  }

  const setLabels = async (newLabels: string) => {
    if (!selectedId) return
    await fetch(`/api/inbox/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: newLabels }),
    })
    setLabelInput(newLabels)
    setActiveConv(activeConv ? { ...activeConv, labels: newLabels } : null)
  }

  const toggleLabel = (label: string) => {
    const current = labelInput ? labelInput.split(',').map((l) => l.trim()) : []
    const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label]
    setLabels(next.join(','))
  }

  const formatTime = (d: Date) => {
    const date = new Date(d)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return date.toLocaleDateString('en-IN', { weekday: 'short' })
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 lg:px-8 py-5 border-b border-ink-100 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">WhatsApp Inbox</h1>
            <p className="text-sm text-ink-600 mt-0.5 flex items-center gap-1.5">
              <span className="pulse-dot" /> AI is handling <span className="font-semibold text-ink-900">{counts.ai} active conversations</span> right now
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list */}
        <div className="w-80 border-r border-ink-100 bg-white flex flex-col overflow-hidden">
          <div className="p-3 border-b border-ink-100">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <Input
                placeholder="Search by name or phone..."
                className="pl-9 bg-ink-50 border-0"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex border-b border-ink-100 text-[11px] overflow-x-auto scrollbar-hide">
            {[
              { k: 'all', label: `All (${counts.all})` },
              { k: 'unread', label: `Unread (${counts.unread})` },
              { k: 'today', label: `Today (${counts.today})` },
              { k: 'ai', label: `AI (${counts.ai})` },
              { k: 'booked', label: `Booked (${counts.booked})` },
              { k: 'needs', label: `Needs you (${counts.needs})` },
            ].map((tab) => (
              <button
                key={tab.k}
                onClick={() => setView(tab.k as any)}
                className={`flex-shrink-0 py-2.5 px-2 font-medium whitespace-nowrap ${
                  view === tab.k ? 'text-teal-700 border-b-2 border-teal-600' : 'text-ink-500 border-b-2 border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 divide-y divide-ink-100 overflow-y-auto scrollbar-hide">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-500">
                No conversations match
              </div>
            ) : (
              filtered.map((c) => {
                const lastMsg = c.messages[0]?.content || ''
                const st = STATUS_LABELS[c.status] || STATUS_LABELS.ai_handling
                const initials = c.customer.name.split(/\s|@/)[0].slice(0, 2).toUpperCase()
                const colorIdx = c.id.charCodeAt(0) % 5
                const colors = ['bg-pink-200 text-pink-700', 'bg-blue-200 text-blue-700', 'bg-purple-200 text-purple-700', 'bg-amber-200 text-amber-700', 'bg-green-200 text-green-700']
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 hover:bg-ink-50 ${selectedId === c.id ? 'bg-teal-50/50 border-l-2 border-teal-600' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${colors[colorIdx]}`}>{initials}</div>
                        {c.unreadCount > 0 && (
                          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {c.unreadCount}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="font-semibold text-sm text-ink-900 truncate">{c.customer.name}</div>
                          <div className="text-[10px] text-ink-500 flex-shrink-0">{formatTime(c.lastMessageAt)}</div>
                        </div>
                        <div className="text-xs text-ink-600 truncate">{lastMsg}</div>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                          {c.labels && c.labels.split(',').slice(0, 2).map((l) => (
                            <span key={l} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">#{l}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Chat panel */}
        {activeConv ? (
          <div className={`flex-1 flex ${showInfo ? '' : ''}`}>
            <div className="flex-1 flex flex-col bg-[#efeae2]">
              {/* Chat header */}
              <div className="px-5 py-3 bg-white border-b border-ink-100 flex items-center gap-3">
                <div className="w-10 h-10 bg-pink-200 rounded-full flex items-center justify-center text-pink-700 font-semibold">
                  {activeConv.customer.name.split(/\s|@/)[0].slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-ink-900">{activeConv.customer.name}</div>
                  <div className="text-xs text-ink-500 flex items-center gap-1.5">
                    {activeConv.aiActive ? (
                      <><span className="pulse-dot" /><span className="text-green-600">AI is replying now</span></>
                    ) : (
                      <span className="text-blue-600">You're handling this chat</span>
                    )}
                    <span>•</span>
                    <span>{activeConv.customer.phone}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowInfo(!showInfo)}>
                  <UserCircle className="w-4 h-4" />
                </Button>
                {activeConv.aiActive ? (
                  <Button variant="outline" size="sm" onClick={takeOver} className="text-red-700 border-red-200">
                    Take over
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={releaseToAI}>
                    <Sparkles className="w-4 h-4 mr-1" /> Back to AI
                  </Button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-ink-500 py-8">No messages yet</div>
                ) : (
                  messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const showDate = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
                    return (
                      <div key={m.id}>
                        {showDate && (
                          <div className="text-center my-2">
                            <span className="text-[10px] text-ink-500 bg-white/80 px-2 py-1 rounded-full">
                              {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[75%]">
                            {m.direction === 'outbound' && (
                              <div className={`flex items-center gap-1.5 mb-1 text-[10px] font-medium ${m.sender === 'ai' ? 'text-green-700' : 'text-blue-700'}`}>
                                {m.sender === 'ai' ? <><Sparkles className="w-3 h-3" /> MarketMitra AI</> : <><UserCircle className="w-3 h-3" /> You</>}
                              </div>
                            )}
                            <div className={`${m.direction === 'outbound' ? (m.sender === 'ai' ? 'bg-[#d9fdd3]' : 'bg-[#cfe5ff]') : 'bg-white'} rounded-lg ${m.direction === 'outbound' ? 'rounded-tr-none' : 'rounded-tl-none'} px-3 py-2 shadow-sm text-sm text-ink-800 whitespace-pre-wrap`}>
                              {m.content}
                            </div>
                            <div className={`text-[10px] text-ink-500 mt-1 ${m.direction === 'outbound' ? 'text-right mr-1' : 'ml-1'}`}>
                              {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="px-5 py-3 bg-white border-t border-ink-100">
                <div className="flex items-center gap-2 mb-2 overflow-x-auto scrollbar-hide">
                  {QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr}
                      onClick={() => setInput(qr)}
                      className="text-xs px-3 py-1 bg-ink-50 text-ink-700 rounded-full whitespace-nowrap hover:bg-ink-100"
                    >
                      {qr}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder={activeConv.aiActive ? 'AI is replying... Take over to send manually' : 'Type a message...'}
                    className="flex-1"
                    disabled={activeConv.aiActive}
                  />
                  <Button variant="brand" size="icon" onClick={sendMessage} disabled={sending || !input.trim() || activeConv.aiActive}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Info panel */}
            {showInfo && (
              <div className="w-80 bg-white border-l border-ink-100 overflow-y-auto p-4 space-y-4">
                <div>
                  <h3 className="font-bold text-ink-900 mb-2">Customer</h3>
                  <div className="p-3 bg-ink-50 rounded-lg space-y-1.5 text-sm">
                    <div className="font-semibold">{activeConv.customer.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-ink-600">
                      <Phone className="w-3 h-3" />{activeConv.customer.phone}
                    </div>
                    {activeConv.customer.email && (
                      <div className="flex items-center gap-1.5 text-xs text-ink-600">
                        <Mail className="w-3 h-3" />{activeConv.customer.email}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-ink-600">
                      <Calendar className="w-3 h-3" />{activeConv.customer.totalVisits} visits
                    </div>
                    <div className="text-xs text-ink-600">Spent ₹{(activeConv.customer.totalSpentPaise / 100).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                {/* Labels */}
                <div>
                  <h3 className="font-bold text-ink-900 mb-2 flex items-center gap-1.5">
                    <Tag className="w-4 h-4" />Labels
                  </h3>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {PRESET_LABELS.map((l) => {
                      const active = labelInput.split(',').map((s) => s.trim()).includes(l)
                      return (
                        <button
                          key={l}
                          onClick={() => toggleLabel(l)}
                          className={`text-xs px-2.5 py-1 rounded-full transition ${
                            active ? 'bg-purple-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                          }`}
                        >
                          #{l}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <h3 className="font-bold text-ink-900 mb-2 flex items-center gap-1.5">
                    <StickyNote className="w-4 h-4" />Internal notes
                  </h3>
                  <textarea
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[100px]"
                    placeholder="Private notes only visible to your team. Not sent to customer."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={saveNotes}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-ink-50">
            <div className="text-center">
              <Search className="w-12 h-12 text-ink-300 mx-auto mb-2" />
              <p className="text-ink-500">Select a conversation to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
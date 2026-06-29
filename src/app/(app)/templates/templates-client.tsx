'use client'

// Templates client — full multi-channel CRUD UI for SMS / Email / WhatsApp
// templates (saves to MessageTemplate via /api/templates), with:
//   - channel + category filters
//   - token-aware editor with preview
//   - AI generation ("Describe the template you want")
//   - bulk render + bulk send to selected customers
//   - per-template usage stats

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Trash2, Eye, EyeOff, Save, X, Send, Sparkles, Loader2,
  Mail, MessageSquare, Smartphone, Hash, ChevronDown, ChevronUp, Layers,
} from 'lucide-react'
import { sampleTemplate } from '@/lib/template-engine'

type Channel = 'whatsapp' | 'sms' | 'email'
type Category = 'marketing' | 'transactional' | 'system'

interface Template {
  id: string
  name: string
  description: string | null
  channel: Channel
  category: Category
  body: string | null
  smsBody: string | null
  emailSubject: string | null
  emailHtml: string | null
  emailText: string | null
  variables: string[]
  status: 'active' | 'archived' | 'draft'
  metaTemplateName: string | null
  timesUsed?: number
  lastUsedAt?: string | null
}

const CHANNEL_META: Record<Channel, { label: string; icon: any; color: string; charLimit: number | null }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-100 text-green-700', charLimit: 4096 },
  sms: { label: 'SMS', icon: Smartphone, color: 'bg-amber-100 text-amber-700', charLimit: 1600 },
  email: { label: 'Email', icon: Mail, color: 'bg-blue-100 text-blue-700', charLimit: null },
}

export function TemplatesClient() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [filterChannel, setFilterChannel] = useState<Channel | ''>('')
  const [filterCategory, setFilterCategory] = useState<Category | ''>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filterChannel) qs.set('channel', filterChannel)
      if (filterCategory) qs.set('category', filterCategory)
      const res = await fetch(`/api/templates?${qs}`)
      const data = await res.json()
      if (Array.isArray(data.templates)) setTemplates(data.templates)
    } catch (err) {
      toast({ title: 'Failed to load templates', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterChannel, filterCategory])

  const counts = useMemo(() => {
    const c = { all: templates.length, whatsapp: 0, sms: 0, email: 0, active: 0 }
    for (const t of templates) {
      c[t.channel]++
      if (t.status === 'active') c.active++
    }
    return c
  }, [templates])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { k: '', label: `All (${counts.all})` },
            { k: 'whatsapp', label: `WhatsApp (${counts.whatsapp})` },
            { k: 'sms', label: `SMS (${counts.sms})` },
            { k: 'email', label: `Email (${counts.email})` },
          ].map((tab) => (
            <button
              key={tab.k}
              onClick={() => setFilterChannel(tab.k as any)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                filterChannel === tab.k ? 'bg-teal-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAIModal(true)}>
            <Sparkles className="w-4 h-4 mr-1" /> AI Generate
          </Button>
          <Button size="sm" variant="brand" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        </div>
      </div>

      <div className="flex gap-2 text-xs">
        {(['', 'marketing', 'transactional', 'system'] as const).map((c) => (
          <button
            key={c || 'all-cat'}
            onClick={() => setFilterCategory(c as any)}
            className={`px-2.5 py-1 rounded-full ${
              filterCategory === c ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {c || 'All categories'}
          </button>
        ))}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-ink-500">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Loading templates…
          </CardContent>
        </Card>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Layers className="w-12 h-12 text-ink-300 mx-auto mb-3" />
            <p className="text-ink-700 font-medium">No templates yet</p>
            <p className="text-sm text-ink-500 mt-1 mb-4">
              Create reusable SMS / Email / WhatsApp templates with {'{{tokens}}'} that auto-fill per customer.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="brand" size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4 mr-1" /> Create Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAIModal(true)}>
                <Sparkles className="w-4 h-4 mr-1" /> Generate with AI
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              editing={editingId === t.id}
              onEdit={() => setEditingId(t.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); load() }}
              onDeleted={load}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {showAIModal && (
        <AIGenerateModal
          onClose={() => setShowAIModal(false)}
          onSaved={() => { setShowAIModal(false); load() }}
          defaultChannel={filterChannel || 'whatsapp'}
        />
      )}
    </div>
  )
}

// ============================================================
// TEMPLATE CARD
// ============================================================

function TemplateCard({
  template, editing, onEdit, onCancelEdit, onSaved, onDeleted,
}: {
  template: Template
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const { toast } = useToast()
  const [showPreview, setShowPreview] = useState(false)
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [category, setCategory] = useState<Category>(template.category)
  const [body, setBody] = useState(
    template.channel === 'whatsapp' ? template.body || '' :
    template.channel === 'sms' ? template.smsBody || '' :
    template.emailHtml || ''
  )
  const [subject, setSubject] = useState(template.emailSubject || '')
  const [textAlt, setTextAlt] = useState(template.emailText || '')
  const [saving, setSaving] = useState(false)

  const Meta = CHANNEL_META[template.channel]
  const Icon = Meta.icon

  const tokens = useMemo(() => {
    const allText = [body, subject, textAlt].filter(Boolean).join('\n')
    const matches = allText.match(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g) || []
    return Array.from(new Set(matches.map((m) => m.replace(/[{}\s]/g, ''))))
  }, [body, subject, textAlt])

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = { name, description, category, status: 'active' }
      if (template.channel === 'whatsapp') payload.body = body
      if (template.channel === 'sms') payload.smsBody = body
      if (template.channel === 'email') {
        payload.emailSubject = subject
        payload.emailHtml = body
        payload.emailText = textAlt || null
      }
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: 'Template saved', variant: 'success' })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!confirm(`Archive "${template.name}"? You can restore it later from the archive.`)) return
    const res = await fetch(`/api/templates/${template.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast({ title: 'Archived', variant: 'success' })
      onDeleted()
    } else {
      toast({ title: 'Failed to archive', variant: 'error' })
    }
  }

  // Preview render — use sample values
  const previewText = useMemo(() => {
    if (template.channel === 'email') {
      const sampleSubject = sampleTemplate(subject, tokens)
      const sampleHtml = sampleTemplate(body, tokens)
      return `${sampleSubject}\n\n${sampleHtml.replace(/<[^>]+>/g, '')}`
    }
    return sampleTemplate(body, tokens)
  }, [body, subject, template.channel, tokens])

  const charCount = template.channel === 'email' ? body.length : body.length
  const charLimit = Meta.charLimit

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className={`w-4 h-4 ${Meta.color.split(' ')[1]}`} />
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 font-bold" />
            ) : (
              <h3 className="font-bold text-ink-900 truncate">{template.name}</h3>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Badge className={Meta.color}>{Meta.label}</Badge>
            <Badge variant="outline">{template.category}</Badge>
          </div>
        </div>

        {editing ? (
          <>
            <Input
              placeholder="Short description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full h-9 rounded border border-ink-200 px-2 text-sm bg-white"
            >
              <option value="marketing">Marketing</option>
              <option value="transactional">Transactional</option>
              <option value="system">System</option>
            </select>
            {template.channel === 'email' && (
              <Input
                placeholder="Subject line"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[120px] font-mono"
              placeholder={`Type your ${Meta.label.toLowerCase()} message. Use {{name}}, {{customer.lastVisitAt}}, {{business.name}}, etc.`}
            />
            {template.channel === 'email' && (
              <textarea
                value={textAlt}
                onChange={(e) => setTextAlt(e.target.value)}
                placeholder="Plain-text version (optional)"
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[60px]"
              />
            )}
            {tokens.length > 0 && (
              <div className="text-[11px] text-ink-500 flex flex-wrap items-center gap-1">
                <Hash className="w-3 h-3" />
                {tokens.map((t) => <code key={t} className="px-1 bg-ink-100 rounded">{`{{${t}}}`}</code>)}
              </div>
            )}
            {charLimit && charCount > charLimit * 0.8 && (
              <div className={`text-[11px] ${charCount > charLimit ? 'text-red-600 font-semibold' : 'text-amber-700'}`}>
                {charCount} / {charLimit} chars
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
              <Button size="sm" variant="brand" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            {template.description && (
              <p className="text-xs text-ink-600">{template.description}</p>
            )}
            <div className="p-3 bg-ink-50 rounded-lg">
              {showPreview ? (
                <div>
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-700 uppercase tracking-wider mb-1">
                    <Sparkles className="w-3 h-3" /> Preview with sample values
                  </div>
                  <pre className="text-sm text-ink-800 whitespace-pre-wrap font-sans">{previewText}</pre>
                </div>
              ) : (
                <pre className="text-sm text-ink-800 whitespace-pre-wrap font-mono">{body || '(empty)'}</pre>
              )}
            </div>
            {tokens.length > 0 && (
              <div className="text-[11px] text-ink-500 flex flex-wrap gap-1">
                <Hash className="w-3 h-3 mt-0.5" />
                {tokens.slice(0, 8).map((t) => (
                  <code key={t} className="px-1 bg-ink-100 rounded">{`{{${t}}}`}</code>
                ))}
                {tokens.length > 8 && <span className="text-ink-400">+{tokens.length - 8} more</span>}
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <div className="text-[10px] text-ink-400">
                {template.timesUsed ? `Used ${template.timesUsed} times` : 'Unused'}
                {template.lastUsedAt && ` • last ${new Date(template.lastUsedAt).toLocaleDateString('en-IN')}`}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPreview ? 'Raw' : 'Preview'}
                </Button>
                <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={archive} className="text-red-700 hover:bg-red-50">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================
// CREATE TEMPLATE MODAL
// ============================================================

function CreateTemplateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('marketing')
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast({ title: 'Name required', variant: 'error' }); return }
    if (channel === 'email' && !subject.trim()) { toast({ title: 'Subject required', variant: 'error' }); return }
    if (!body.trim()) { toast({ title: 'Body required', variant: 'error' }); return }

    setSaving(true)
    try {
      const payload: any = { name, description, category, channel, status: 'active' }
      if (channel === 'whatsapp') payload.body = body
      if (channel === 'sms') payload.smsBody = body
      if (channel === 'email') {
        payload.emailSubject = subject
        payload.emailHtml = body
      }
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Create failed')
      toast({ title: 'Template created', variant: 'success' })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="New template" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-ink-700">Channel</label>
          <div className="flex gap-2 mt-1">
            {(['whatsapp', 'sms', 'email'] as Channel[]).map((c) => {
              const Meta = CHANNEL_META[c]
              const Icon = Meta.icon
              return (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    channel === c ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {Meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-700">Name</label>
          <Input placeholder="e.g. Booking Confirmation" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-700">Description (internal)</label>
          <Input placeholder="Short note about what this template is for" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-700">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full h-9 rounded border border-ink-200 px-2 text-sm bg-white"
          >
            <option value="marketing">Marketing</option>
            <option value="transactional">Transactional</option>
            <option value="system">System</option>
          </select>
        </div>

        {channel === 'email' && (
          <div>
            <label className="text-xs font-semibold text-ink-700">Subject</label>
            <Input placeholder="Subject line (under 60 chars)" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-ink-700">
            Body — use {`{{tokens}}`} for variable parts
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === 'whatsapp' ? '🙏 नमस्ते {{name}}! आपकी appointment {{appointment.date}} को confirm है।' :
              channel === 'sms' ? 'Namaste {{name}}, apki booking {{appointment.date}} ko confirm hai.' :
              '<h2>Hi {{name}},</h2><p>Your appointment at {{business.name}} is confirmed for {{appointment.datetime}}.</p>'
            }
            className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[140px] font-mono"
          />
          <div className="text-[11px] text-ink-500 mt-1">
            Available: {`{{name}}`}, {`{{customer.phone}}`}, {`{{customer.lastVisitAt}}`}, {`{{business.name}}`}, {`{{appointment.date}}`}, {`{{appointment.time}}`}, {`{{custom.<key>}}`}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
            Create template
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================
// AI GENERATE MODAL
// ============================================================

function AIGenerateModal({
  onClose, onSaved, defaultChannel,
}: {
  onClose: () => void
  onSaved: () => void
  defaultChannel: Channel
}) {
  const { toast } = useToast()
  const [channel, setChannel] = useState<Channel>(defaultChannel || 'whatsapp')
  const [category, setCategory] = useState<Category>('marketing')
  const [purpose, setPurpose] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState<'warm' | 'professional' | 'urgent' | 'casual'>('warm')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<any>(null)

  const generate = async () => {
    if (!purpose.trim()) { toast({ title: 'Describe what the template is for', variant: 'error' }); return }
    setGenerating(true)
    try {
      const res = await fetch('/api/templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, category, purpose, audience, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setResult(data.template)
    } catch (err: any) {
      toast({ title: 'AI generation failed', description: err.message, variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const saveAs = async () => {
    if (!result) return
    const name = prompt('Name this template:', result.name || purpose.slice(0, 50))
    if (!name) return
    try {
      const payload: any = { ...result, name, channel, category, status: 'active' }
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: 'Template saved', variant: 'success' })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    }
  }

  return (
    <Modal title="Generate template with AI" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-600">
          Describe what the template is for and AI will draft it for your channel. You can edit before saving.
        </p>

        <div>
          <label className="text-xs font-semibold text-ink-700">Channel</label>
          <div className="flex gap-2 mt-1">
            {(['whatsapp', 'sms', 'email'] as Channel[]).map((c) => {
              const Meta = CHANNEL_META[c]
              const Icon = Meta.icon
              return (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                    channel === c ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {Meta.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-700">Purpose</label>
          <Input
            placeholder="e.g. Remind inactive customers about a 20% off offer"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold text-ink-700">Audience (optional)</label>
            <Input
              placeholder="e.g. customers who haven't visited in 90+ days"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-700">Tone</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as any)}
              className="w-full h-9 rounded border border-ink-200 px-2 text-sm bg-white"
            >
              <option value="warm">Warm</option>
              <option value="professional">Professional</option>
              <option value="urgent">Urgent</option>
              <option value="casual">Casual</option>
            </select>
          </div>
        </div>

        <Button variant="brand" onClick={generate} disabled={generating} className="w-full">
          {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Generate
        </Button>

        {result && (
          <div className="border border-teal-200 bg-teal-50 rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold text-teal-800 uppercase">AI draft</div>
            {result.emailSubject && (
              <div className="text-sm">
                <span className="font-semibold">Subject:</span> {result.emailSubject}
              </div>
            )}
            <pre className="text-sm whitespace-pre-wrap font-mono bg-white rounded p-2">
              {result.body || result.smsBody || result.emailHtml}
            </pre>
            {result.variables?.length > 0 && (
              <div className="text-[11px] text-ink-500">
                Variables: {result.variables.map((v: string) => `{{${v}}}`).join(', ')}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={generate}>
                <Sparkles className="w-3 h-3 mr-1" /> Regenerate
              </Button>
              <Button size="sm" variant="brand" onClick={saveAs}>
                <Save className="w-3 h-3 mr-1" /> Save as template
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ============================================================
// MODAL SHELL
// ============================================================

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white">
          <h2 className="font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-ink-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
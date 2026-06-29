// Drip Sequences — list + builder UI

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  Mail, Plus, Trash2, Edit3, Play, Pause, Archive, ArrowRight, ArrowLeft,
  Loader2, Sparkles, X, Save, Clock, Users, CheckCircle2, AlertCircle, Send, ChevronRight
} from 'lucide-react'

interface DripStep {
  id?: string
  position: number
  delayHours: number
  templateName?: string | null
  templateLang?: string
  templateParams?: string[]
  messageBody?: string | null
}

interface DripSequence {
  id: string
  name: string
  description: string | null
  trigger: 'manual' | 'new_customer' | 'appointment_completed' | 'lead_captured' | 'tag_added'
  triggerConfig: string | null
  status: 'active' | 'paused' | 'archived'
  steps: DripStep[]
  _count?: { enrollments: number }
  createdAt: string
}

const TRIGGER_LABELS: Record<DripSequence['trigger'], string> = {
  manual: 'Manual enrollment',
  new_customer: 'When new customer is added',
  appointment_completed: 'After appointment is completed',
  lead_captured: 'When a lead is captured',
  tag_added: 'When a tag is added',
}

function parseTriggerConfig(s: string | null | undefined): Record<string, any> {
  if (!s) return {}
  try { return JSON.parse(s) } catch { return {} }
}

export function DripsManager() {
  const { toast } = useToast()
  const [sequences, setSequences] = useState<DripSequence[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DripSequence | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/drips/sequences')
      const data = await res.json()
      setSequences(data.sequences || [])
    } finally { setLoading(false) }
  }

  const remove = async (s: DripSequence) => {
    if (!confirm(`Delete sequence "${s.name}"? All enrollments will be lost.`)) return
    try {
      await fetch(`/api/drips/sequences/${s.id}`, { method: 'DELETE' })
      toast({ title: 'Deleted', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'error' })
    }
  }

  const toggleStatus = async (s: DripSequence) => {
    const newStatus = s.status === 'active' ? 'paused' : 'active'
    try {
      await fetch(`/api/drips/sequences/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      load()
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'error' })
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Mail className="w-7 h-7 text-teal-600" />
            Drip Sequences
          </h1>
          <p className="text-ink-600 mt-1">
            Send timed message sequences to customers — reactivation, onboarding, follow-ups.
          </p>
        </div>
        <Button variant="brand" onClick={() => { setEditing(null); setCreating(true) }}>
          <Plus className="w-4 h-4" />New sequence
        </Button>
      </div>

      {/* Tip card */}
      <Card>
        <CardContent className="p-4 bg-blue-50 border-blue-200 text-sm text-blue-900">
          <strong>💡 How drips work:</strong> When the trigger fires, the customer is enrolled.
          Step 1 sends after the configured delay, then Step 2, and so on.
          If the customer replies to anything, the sequence stops automatically.
        </CardContent>
      </Card>

      {(creating || editing) && (
        <DripEditor
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}

      <div className="space-y-3">
        {loading ? (
          <Card><CardContent className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
        ) : sequences.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Mail className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No drip sequences yet</p>
              <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
                Create a sequence like "3-step reactivation" or "post-visit follow-up" and let it run on autopilot.
              </p>
              <Button variant="brand" className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" />Create your first sequence
              </Button>
            </CardContent>
          </Card>
        ) : (
          sequences.map((s) => {
            const cfg = parseTriggerConfig(s.triggerConfig)
            return (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink-900">{s.name}</span>
                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                          s.status === 'active' ? 'bg-green-100 text-green-700' :
                          s.status === 'paused' ? 'bg-amber-100 text-amber-700' :
                          'bg-ink-100 text-ink-600'
                        }`}>{s.status}</span>
                      </div>
                      {s.description && <p className="text-sm text-ink-600 mt-1">{s.description}</p>}
                      <div className="text-xs text-ink-500 mt-2 flex flex-wrap items-center gap-2">
                        <span>Trigger: {TRIGGER_LABELS[s.trigger]}</span>
                        {cfg.tag && s.trigger === 'tag_added' && (
                          <span className="px-1.5 py-0.5 bg-ink-100 rounded">tag: {cfg.tag}</span>
                        )}
                        <span>· {s.steps.length} step{s.steps.length !== 1 && 's'}</span>
                        <span>· <Users className="w-3 h-3 inline" /> {s._count?.enrollments || 0} enrollments</span>
                      </div>
                      {/* Mini timeline */}
                      <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-1">
                        {s.steps.map((step, i) => (
                          <div key={i} className="flex items-center gap-1 flex-shrink-0">
                            <div className="px-2 py-1 bg-teal-50 border border-teal-200 rounded text-xs text-teal-800">
                              <div className="font-semibold">{step.templateName || 'Free-form'}</div>
                              <div className="text-[10px] text-teal-600">
                                {step.delayHours === 0 ? 'immediately' :
                                 step.delayHours < 24 ? `+${step.delayHours}h` :
                                 `+${Math.round(step.delayHours / 24)}d`}
                              </div>
                            </div>
                            {i < s.steps.length - 1 && <ChevronRight className="w-3 h-3 text-ink-300" />}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => toggleStatus(s)}>
                        {s.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)} className="text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

// ============================================================
// DRIP EDITOR
// ============================================================

function DripEditor({
  existing,
  onClose,
  onSaved,
}: {
  existing: DripSequence | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(existing?.name || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [trigger, setTrigger] = useState<DripSequence['trigger']>(existing?.trigger || 'manual')
  const [triggerTag, setTriggerTag] = useState<string>(parseTriggerConfig(existing?.triggerConfig).tag || '')
  const [steps, setSteps] = useState<DripStep[]>(existing?.steps || [
    { position: 0, delayHours: 0, templateName: '', templateParams: [] },
  ])
  const [saving, setSaving] = useState(false)

  const addStep = () => {
    setSteps([
      ...steps,
      { position: steps.length, delayHours: 24, templateName: '', templateParams: [] },
    ])
  }

  const updateStep = (idx: number, updates: Partial<DripStep>) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...updates } : s)))
  }

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return
    setSteps(steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })))
  }

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= steps.length) return
    const arr = [...steps]
    ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
    setSteps(arr.map((s, i) => ({ ...s, position: i })))
  }

  const save = async () => {
    if (!name.trim()) {
      toast({ title: 'Name required', variant: 'error' })
      return
    }
    if (steps.length === 0) {
      toast({ title: 'Add at least one step', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger,
        triggerConfig: trigger === 'tag_added' && triggerTag ? { tag: triggerTag } : null,
        steps: steps.map((s) => ({
          delayHours: s.delayHours,
          templateName: s.templateName || undefined,
          templateLang: s.templateLang || 'en',
          templateParams: s.templateParams && s.templateParams.length ? s.templateParams : undefined,
          messageBody: s.messageBody || undefined,
        })),
      }
      const url = existing ? `/api/drips/sequences/${existing.id}` : '/api/drips/sequences'
      const method = existing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: existing ? 'Updated' : 'Created', variant: 'success' })
      onSaved()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{existing ? 'Edit sequence' : 'New drip sequence'}</span>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 3-step post-visit follow-up"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-600 mb-1.5 block">Trigger</label>
            <select
              className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as DripSequence['trigger'])}
            >
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {trigger === 'tag_added' && (
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Tag to watch for</label>
              <Input
                value={triggerTag}
                onChange={(e) => setTriggerTag(e.target.value)}
                placeholder="e.g. vip"
              />
            </div>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-ink-600 mb-1.5 block">Description (optional)</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this sequence for?"
          />
        </div>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-ink-700">Steps</label>
            <Button size="sm" variant="outline" onClick={addStep}>
              <Plus className="w-3 h-3" />Add step
            </Button>
          </div>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <Card key={idx}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-ink-700">Step {idx + 1}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => moveStep(idx, -1)} disabled={idx === 0}>
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}>
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeStep(idx)} disabled={steps.length <= 1} className="text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-ink-600 mb-1 block">
                        <Clock className="w-3 h-3 inline" /> Delay (hours)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delayHours}
                        onChange={(e) => updateStep(idx, { delayHours: parseInt(e.target.value) || 0 })}
                      />
                      <div className="text-[10px] text-ink-500 mt-0.5">
                        {step.delayHours === 0 ? 'Immediately' :
                         step.delayHours < 24 ? `${step.delayHours} hours after previous` :
                         `${Math.round(step.delayHours / 24)} days after previous`}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-medium text-ink-600 mb-1 block">
                        Template name (Meta-approved, optional)
                      </label>
                      <Input
                        value={step.templateName || ''}
                        onChange={(e) => updateStep(idx, { templateName: e.target.value })}
                        placeholder="e.g. booking_confirmation"
                      />
                    </div>
                  </div>
                  {step.templateName && (
                    <div>
                      <label className="text-[10px] font-medium text-ink-600 mb-1 block">
                        Template variables (one per line, e.g. <code className="text-[10px]">name</code>, <code className="text-[10px]">customer.last_treatment</code>)
                      </label>
                      <textarea
                        className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs font-mono min-h-[60px]"
                        value={(step.templateParams || []).join('\n')}
                        onChange={(e) =>
                          updateStep(idx, {
                            templateParams: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder={'name\nbooking_link\ncustomer.last_treatment'}
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-medium text-ink-600 mb-1 block">
                      Or free-form body (only if no template — for service-window replies)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs min-h-[60px]"
                      value={step.messageBody || ''}
                      onChange={(e) => updateStep(idx, { messageBody: e.target.value })}
                      placeholder="Optional — only use for messages within 24h service window"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="brand" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {existing ? 'Save changes' : 'Create sequence'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  )
}
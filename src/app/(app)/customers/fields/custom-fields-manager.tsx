// Custom Fields management page — defines fields once, used everywhere
// (customer records, drip templates, broadcast personalization, CTWA targeting).

'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/confirm-dialog'
import { Plus, Trash2, Save, Loader2, X, Hash, Type, Calendar, ListChecks, CheckSquare, ToggleLeft, GripVertical } from 'lucide-react'

interface CustomField {
  id: string
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'multiselect'
  options?: string[]
  required: boolean
  active: boolean
  order: number
}

const TYPE_META = {
  text: { icon: Type, label: 'Text', hint: 'Free-form text (name, email, anything)' },
  number: { icon: Hash, label: 'Number', hint: 'Numeric value (age, family size, etc.)' },
  date: { icon: Calendar, label: 'Date', hint: 'Date value (visit date, follow-up)' },
  select: { icon: ListChecks, label: 'Single select', hint: 'Pick one option' },
  multiselect: { icon: ListChecks, label: 'Multi select', hint: 'Pick multiple options' },
  boolean: { icon: ToggleLeft, label: 'Yes/No', hint: 'Toggle true/false' },
} as const

export function CustomFieldsManager() {
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Partial<CustomField>>({ type: 'text' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-fields')
      const data = await res.json()
      const parsed = (data.fields || []).map((f: any) => ({
        ...f,
        options: f.options ? JSON.parse(f.options) : undefined,
      }))
      setFields(parsed)
    } finally {
      setLoading(false)
    }
  }

  const startCreate = () => {
    setDraft({ type: 'text', label: '', key: '', options: [] })
    setEditing(null)
    setCreating(true)
  }

  const startEdit = (f: CustomField) => {
    setDraft({ ...f })
    setCreating(false)
    setEditing(f.id)
  }

  const cancel = () => {
    setEditing(null)
    setCreating(false)
    setDraft({})
  }

  const autoKeyFromLabel = (label: string) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s_]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 50)
  }

  const save = async () => {
    if (!draft.label || !draft.key || !draft.type) {
      toast({ title: 'Label, key and type are required', variant: 'error' })
      return
    }
    setSaving(true)
    try {
      const body = {
        key: draft.key,
        label: draft.label,
        type: draft.type,
        options: draft.options,
        required: !!draft.required,
        order: draft.order || 0,
      }
      const res = await fetch(editing ? `/api/custom-fields/${editing}` : '/api/custom-fields', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: editing ? 'Field updated' : 'Field created', variant: 'success' })
      cancel()
      load()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (f: CustomField) => {
    if (!(await confirm({
      title: `Delete "${f.label}"?`,
      message: 'All customer values for this field will be lost. Any AI prompt, template or drip referencing this field will fail validation until removed.',
      confirmText: 'Delete field',
      destructive: true,
    }))) return
    try {
      const res = await fetch(`/api/custom-fields/${f.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      toast({ title: 'Field deleted', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'error' })
    }
  }

  const toggleActive = async (f: CustomField) => {
    try {
      const res = await fetch(`/api/custom-fields/${f.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !f.active }),
      })
      if (!res.ok) throw new Error('Update failed')
      load()
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'error' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <ListChecks className="w-7 h-7 text-teal-600" />
            Custom Fields
          </h1>
          <p className="text-ink-600 mt-1">
            Add fields beyond name & phone. Use them in templates, broadcasts, and drip sequences with{' '}
            <code className="px-1.5 py-0.5 bg-ink-100 rounded text-xs">{`{{customer.<key>}}`}</code>.
          </p>
        </div>
        <Button variant="brand" onClick={startCreate}>
          <Plus className="w-4 h-4" />New field
        </Button>
      </div>

      {(creating || editing) && (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader>
            <CardTitle className="text-base">{editing ? 'Edit field' : 'New custom field'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-600 block mb-1">Label</label>
                <Input
                  value={draft.label || ''}
                  onChange={(e) => {
                    const label = e.target.value
                    setDraft({
                      ...draft,
                      label,
                      // Auto-derive key only when creating (not editing existing keys)
                      key: !editing ? autoKeyFromLabel(label) : draft.key,
                    })
                  }}
                  placeholder="e.g. Last Treatment"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-600 block mb-1">
                  Key <span className="text-ink-400">(machine name, used in templates)</span>
                </label>
                <Input
                  value={draft.key || ''}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  placeholder="e.g. last_treatment"
                  disabled={!!editing}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-600 block mb-1">Type</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(TYPE_META).map(([key, meta]) => {
                  const Icon = meta.icon
                  const active = draft.type === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDraft({ ...draft, type: key as any })}
                      className={`p-3 border rounded-lg text-left transition ${
                        active ? 'border-teal-500 bg-teal-50' : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-ink-700" />
                        <span className="font-medium text-sm">{meta.label}</span>
                      </div>
                      <div className="text-xs text-ink-500">{meta.hint}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {(draft.type === 'select' || draft.type === 'multiselect') && (
              <div>
                <label className="text-xs font-medium text-ink-600 block mb-1">
                  Options <span className="text-ink-400">(one per line)</span>
                </label>
                <textarea
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[100px] font-mono"
                  value={(draft.options || []).join('\n')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder={'Crown\nRoot Canal\nCleaning\nFilling'}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!draft.required}
                onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                className="rounded"
              />
              Required for new customers
            </label>

            <div className="flex gap-2 pt-2">
              <Button variant="brand" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Save changes' : 'Create field'}
              </Button>
              <Button variant="ghost" onClick={cancel}>
                <X className="w-4 h-4" />Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-ink-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
        ) : fields.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ListChecks className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No custom fields yet</p>
              <p className="text-sm text-ink-500 mt-1">
                Add fields like <strong>Last Treatment</strong>, <strong>Insurance Provider</strong>, or <strong>Family Size</strong> to personalize your messages.
              </p>
              <Button variant="brand" onClick={startCreate} className="mt-4">
                <Plus className="w-4 h-4" />Create your first field
              </Button>
            </CardContent>
          </Card>
        ) : (
          fields.map((f) => {
            const meta = TYPE_META[f.type]
            const Icon = meta.icon
            return (
              <Card key={f.id} className={!f.active ? 'opacity-60' : ''}>
                <CardContent className="p-4 flex items-center gap-3">
                  <GripVertical className="w-4 h-4 text-ink-300" />
                  <Icon className="w-4 h-4 text-ink-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink-900">{f.label}</span>
                      <code className="px-1.5 py-0.5 bg-ink-100 rounded text-[10px] text-ink-600">{f.key}</code>
                      {f.required && <span className="text-[10px] text-red-600 font-semibold uppercase">Required</span>}
                      {!f.active && <span className="text-[10px] text-ink-500 font-semibold uppercase">Inactive</span>}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {meta.label}
                      {f.options && f.options.length > 0 && (
                        <> · {f.options.slice(0, 4).join(', ')}{f.options.length > 4 && ` +${f.options.length - 4}`}</>
                      )}
                      <span className="ml-2 text-ink-400">Use in templates: <code className="text-[10px]">{`{{customer.${f.key}}}`}</code></span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(f)}>
                    {f.active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(f)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(f)} className="text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <Card>
        <CardContent className="p-4 bg-blue-50 border-blue-200 text-sm text-blue-900 space-y-2">
          <div className="font-semibold">💡 Tips</div>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Keys are permanent — once created, you can't rename them (because templates reference them).</li>
            <li>Use them in WhatsApp templates and broadcasts: <code className="bg-white px-1 rounded">{`{{customer.last_treatment}}`}</code>.</li>
            <li>The AI uses them automatically when answering customers — set values to make replies feel personal.</li>
            <li>Disabled fields hide from new edits but keep their existing values for reference.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
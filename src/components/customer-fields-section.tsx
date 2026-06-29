// CustomFieldsSection — renders inputs for all active custom fields for a customer.
// Used inside customer edit modal (and could be reused elsewhere).

'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

interface CustomFieldDef {
  id: string
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'multiselect'
  options?: string[]
  required: boolean
}

export function CustomerFieldsSection({
  customerId,
  onSaved,
}: {
  customerId: string
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [fields, setFields] = useState<CustomFieldDef[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [fieldsRes, valuesRes] = await Promise.all([
          fetch('/api/custom-fields'),
          fetch(`/api/customers/${customerId}/custom-field-values`).catch(() => null),
        ])
        const fieldsData = await fieldsRes.json()
        if (cancelled) return
        const defs: CustomFieldDef[] = (fieldsData.fields || []).map((f: any) => ({
          ...f,
          options: f.options ? JSON.parse(f.options) : undefined,
        }))
        setFields(defs)

        if (valuesRes && valuesRes.ok) {
          const vData = await valuesRes.json()
          if (!cancelled) setValues(vData.values || {})
        }
      } catch (err) {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [customerId])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="w-3 h-3 animate-spin" />Loading fields…</div>
  }
  if (fields.length === 0) {
    return (
      <div className="text-xs text-ink-500 italic">
        No custom fields defined yet. Add them in <a href="/customers/fields" className="text-teal-600 underline">Settings → Custom Fields</a>.
      </div>
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/customers/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, values }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({ title: 'Custom fields saved', variant: 'success' })
      onSaved?.()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-ink-700">Custom fields</div>
          <div className="text-[10px] text-ink-500">Personalize messages with {`{{customer.<key>}}`}</div>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save fields'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          const value = values[f.key] || ''
          return (
            <div key={f.id}>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">
                {f.label}
                {f.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {f.type === 'text' && (
                <Input value={value} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
              {f.type === 'number' && (
                <Input type="number" value={value} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
              {f.type === 'date' && (
                <Input type="date" value={value} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
              {f.type === 'select' && (
                <select
                  className="w-full h-10 rounded-lg border border-ink-200 px-3 text-sm bg-white"
                  value={value}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  <option value="">— select —</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              {f.type === 'multiselect' && (
                <div className="space-y-1">
                  {(f.options || []).map((opt) => {
                    const selected = value.split(',').map((s) => s.trim()).includes(opt)
                    return (
                      <label key={opt} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const set = new Set(value.split(',').map((s) => s.trim()).filter(Boolean))
                            if (e.target.checked) set.add(opt)
                            else set.delete(opt)
                            setValues({ ...values, [f.key]: [...set].join(',') })
                          }}
                          className="rounded"
                        />
                        {opt}
                      </label>
                    )
                  })}
                </div>
              )}
              {f.type === 'boolean' && (
                <label className="flex items-center gap-2 text-sm pt-2">
                  <input
                    type="checkbox"
                    checked={value === 'true'}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.checked ? 'true' : 'false' })}
                    className="rounded"
                  />
                  Yes
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
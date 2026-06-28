'use client'

// Templates client: fetches approved WhatsApp templates from Meta API
// (with fallback to built-in templates when WhatsApp isn't configured yet)
// Each template card shows:
//  - The raw template body (with {{1}}, {{2}} placeholders)
//  - A "Show preview" toggle that fills placeholders with sample values
//  - Variables list

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, RefreshCw, Sparkles, Loader2, FileText, AlertCircle } from 'lucide-react'
import { sampleTemplate } from '@/lib/template-engine'

interface WATemplate {
  id: string
  name: string
  category: string
  language: string
  status: string
  body: string
  variables: string[]
  source: 'meta' | 'fallback'
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<'meta' | 'fallback' | 'cache' | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [previewing, setPreviewing] = useState<string | null>(null)

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true)
    try {
      const res = await fetch(refresh ? '/api/whatsapp/templates' : '/api/whatsapp/templates', {
        method: refresh ? 'POST' : 'GET',
        cache: 'no-store',
      })
      const data = await res.json()
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates)
        setSource(data.source)
      }
    } catch (err) {
      console.error('Failed to load templates', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(false)
  }, [])

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-ink-600">
          <Badge variant={source === 'meta' ? 'success' : 'secondary'}>
            {source === 'meta' ? '✓ Live from Meta' : source === 'fallback' ? 'Sample templates' : source || 'Loading…'}
          </Badge>
          {source === 'fallback' && (
            <span className="text-xs text-amber-700 inline-flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Connect WhatsApp in Settings to load your actual approved templates
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {refreshing ? 'Refreshing…' : 'Refresh from Meta'}
        </Button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-ink-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
          Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-ink-300 mx-auto mb-3" />
            <p className="text-ink-700 font-medium">No templates yet</p>
            <p className="text-sm text-ink-500 mt-1">Create approved templates in Meta Business Manager, then refresh.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id || t.name}
              template={t}
              showPreview={previewing === t.id}
              onTogglePreview={() => setPreviewing(previewing === t.id ? null : t.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateCard({ template, showPreview, onTogglePreview }: { template: WATemplate; showPreview: boolean; onTogglePreview: () => void }) {
  const filled = sampleTemplate(template.body, template.variables || [])
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <h3 className="font-bold text-ink-900">{template.name}</h3>
          </div>
          <div className="flex gap-1.5">
            <Badge variant={template.category === 'UTILITY' ? 'default' : 'secondary'} className="text-[10px]">
              {template.category}
            </Badge>
            <Badge variant="success" className="text-[10px]">{template.status}</Badge>
            <Badge variant="outline" className="text-[10px]">{template.language}</Badge>
          </div>
        </div>

        <div className="p-3 bg-ink-50 rounded-lg">
          {showPreview ? (
            <div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-teal-700 uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" /> Preview with sample values
              </div>
              <p className="text-sm text-ink-800 whitespace-pre-wrap">{filled}</p>
            </div>
          ) : (
            <p className="text-sm text-ink-800 whitespace-pre-wrap font-mono">{template.body}</p>
          )}
        </div>

        {template.variables && template.variables.length > 0 && (
          <div className="text-[11px] text-ink-500">
            <span className="font-semibold">Variables:</span>{' '}
            {template.variables.map((v, i) => (
              <code key={i} className="px-1 py-0.5 bg-ink-100 rounded mr-1">{`{{${i + 1}}}`} → {v}</code>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onTogglePreview}>
            <Eye className="w-3 h-3" />
            {showPreview ? 'Show raw' : 'Show preview'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Edit2, Save, X, Plus, FileText, Eye, Sparkles } from 'lucide-react'

interface Template {
  name: string
  category: string
  language: string
  status: string
  body: string
  variables: string[]
  example: string
}

export function TemplateEditor({ template, statusVariant }: { template: Template; statusVariant: any }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(template.body)
  const [name, setName] = useState(template.name)
  const [showPreview, setShowPreview] = useState(false)
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    Object.fromEntries(template.variables.map((v, i) => [v, ['रिया', '15 जनवरी', 'Dental Cleaning', '6', '20', 'https://marketmitra.com/widget'][i] || `{${v}}`]))
  )

  const save = async () => {
    toast({ title: 'Template saved', variant: 'success' })
    setEditing(false)
  }

  const insertVariable = (v: string) => {
    setBody(body + `{{${template.variables.indexOf(v) + 1}}}`)
  }

  // Render preview by replacing {{1}}, {{2}}, etc. with values
  const renderPreview = () => {
    let result = body
    for (let i = 0; i < template.variables.length; i++) {
      const val = previewValues[template.variables[i]] || `{${template.variables[i]}}`
      result = result.replaceAll(`{{${i + 1}}}`, val)
    }
    return result
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            {name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{template.category}</Badge>
            <Badge variant="outline">{template.language.toUpperCase()}</Badge>
            <Badge variant={statusVariant}>{template.status}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Message body</label>
              <textarea
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[120px]"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="text-xs text-ink-500 mt-1">{body.length} characters</div>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-600 mb-1.5 block">Insert variable:</label>
              <div className="flex flex-wrap gap-1">
                {template.variables.map((v) => (
                  <Button key={v} size="sm" variant="outline" onClick={() => insertVariable(v)}>
                    <Plus className="w-3 h-3" />{v}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setBody(template.body); setName(template.name); setEditing(false) }}>
                <X className="w-3 h-3" />Cancel
              </Button>
              <Button variant="brand" onClick={save}>
                <Save className="w-3 h-3" />Save
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3 bg-ink-50 rounded-lg text-sm whitespace-pre-wrap font-mono">
              {template.body}
            </div>
            <div className="text-xs text-ink-500">
              {template.variables.length} variable{template.variables.length !== 1 ? 's' : ''}: {template.variables.map((v) => `{{${template.variables.indexOf(v) + 1}}}=${v}`).join(', ')}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-ink-100">
              <Button size="sm" variant="ghost" onClick={() => setShowPreview(!showPreview)}>
                <Eye className="w-3 h-3" />{showPreview ? 'Hide' : 'Show'} preview
              </Button>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Edit2 className="w-3 h-3" />Edit
                </Button>
                <Button size="sm" variant="outline">
                  <Sparkles className="w-3 h-3" />A/B test
                </Button>
              </div>
            </div>
            {showPreview && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-xs text-green-700 font-semibold mb-2">📱 WhatsApp preview (with sample data)</div>
                <div className="text-xs text-green-700 mb-2 space-y-1">
                  {template.variables.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="font-mono w-32">{`{{${template.variables.indexOf(v) + 1}}}`} =</span>
                      <input
                        className="flex-1 px-2 py-0.5 border border-green-300 rounded text-xs"
                        value={previewValues[v] || ''}
                        onChange={(e) => setPreviewValues({ ...previewValues, [v]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 p-2 bg-white rounded text-sm whitespace-pre-wrap">
                  {renderPreview()}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
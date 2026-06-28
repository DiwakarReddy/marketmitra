'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Save, BookOpen, Sparkles, Plus, Trash2, Loader2, FileText, Tag } from 'lucide-react'

const SECTIONS = [
  { id: 'about', title: 'About the business', placeholder: 'Tell customers about your business — when you started, what makes you different, your mission, etc.' },
  { id: 'services', title: 'Services & pricing', placeholder: 'Dental cleaning: ₹500\nRoot canal: ₹3,000-5,000\n...' },
  { id: 'hours', title: 'Hours & availability', placeholder: 'Mon-Sat: 9 AM - 8 PM\nSunday: closed' },
  { id: 'policies', title: 'Policies', placeholder: 'Cancellation: 24 hours notice\nNo-show fee: ₹200\n...' },
  { id: 'faq', title: 'Common questions', placeholder: 'Q: Do you accept insurance?\nA: Yes, all major insurers...' },
  { id: 'tone', title: 'AI tone & personality', placeholder: 'Warm, professional, uses Hinglish. Always mentions Dr. Priya.' },
]

export function KnowledgeEditor({ initialKnowledge }: { initialKnowledge: string }) {
  const { toast } = useToast()
  const [sections, setSections] = useState<{ id: string; title: string; content: string }[]>(() => {
    if (!initialKnowledge) return SECTIONS.map((s) => ({ id: s.id, title: s.title, content: '' }))

    // Try to parse the knowledge as sections (separated by ## headers)
    const parsed: { id: string; title: string; content: string }[] = []
    const parts = initialKnowledge.split(/^## /m).filter(Boolean)
    for (const part of parts) {
      const [title, ...contentLines] = part.split('\n')
      const id = title.toLowerCase().replace(/[^a-z]/g, '-')
      parsed.push({ id, title: title.trim(), content: contentLines.join('\n').trim() })
    }
    return parsed.length > 0 ? parsed : SECTIONS.map((s) => ({ id: s.id, title: s.title, content: '' }))
  })
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const updateSection = (id: string, content: string) => {
    setSections(sections.map((s) => s.id === id ? { ...s, content } : s))
  }

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id))
  }

  const addSection = () => {
    if (!newTitle.trim()) return
    const id = newTitle.toLowerCase().replace(/[^a-z]/g, '-')
    setSections([...sections, { id, title: newTitle, content: '' }])
    setNewTitle('')
    setAddingNew(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      const formatted = sections.map((s) => `## ${s.title}\n${s.content}`).join('\n\n')
      const res = await fetch('/api/knowledge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge: formatted }),
      })
      if (!res.ok) throw new Error('Failed')
      toast({ title: 'Knowledge base saved', description: 'AI will use this in conversations', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const autoFill = async (id: string) => {
    const section = sections.find((s) => s.id === id)
    if (!section) return
    try {
      const res = await fetch('/api/ai/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate content for the "${section.title}" section of a dental clinic's knowledge base. Write in a friendly, factual tone. Keep under 100 words. If you don't know specific details (prices, hours), use placeholders.`,
        }),
      })
      const data = await res.json()
      if (data.response) {
        updateSection(id, data.response)
        toast({ title: 'AI generated content', variant: 'success' })
      }
    } catch (err) {
      toast({ title: 'AI failed', variant: 'error' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-teal-600" />
            Knowledge Base
          </h1>
          <p className="text-ink-600 mt-1">Train your AI on your business. Anything you add here gets used in WhatsApp, voice, and Instagram replies.</p>
        </div>
        <Button variant="brand" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : 'Save knowledge base'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 bg-blue-50 border-blue-200 text-sm text-blue-900">
          💡 <strong>Tip:</strong> The more specific you are, the better your AI sounds. Include actual prices, your hours, common questions, and any policies. AI uses this for every customer conversation.
        </CardContent>
      </Card>

      <div className="space-y-4">
        {sections.map((section) => {
          const meta = SECTIONS.find((s) => s.id === section.id) || { placeholder: '' }
          return (
            <Card key={section.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="w-4 h-4 text-ink-500" />
                    {section.title}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => autoFill(section.id)}>
                      <Sparkles className="w-3 h-3" />AI fill
                    </Button>
                    {!SECTIONS.find((s) => s.id === section.id) && (
                      <Button size="sm" variant="ghost" onClick={() => removeSection(section.id)} className="text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[100px]"
                  value={section.content}
                  onChange={(e) => updateSection(section.id, e.target.value)}
                  placeholder={meta.placeholder}
                />
                <div className="text-xs text-ink-500 mt-1">
                  {section.content.length} characters
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {addingNew ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <Input
              placeholder="Section title (e.g. Special offers)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSection()}
            />
            <Button variant="brand" onClick={addSection}>Add</Button>
            <Button variant="ghost" onClick={() => setAddingNew(false)}>Cancel</Button>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setAddingNew(true)}>
          <Plus className="w-4 h-4" />Add custom section
        </Button>
      )}
    </div>
  )
}
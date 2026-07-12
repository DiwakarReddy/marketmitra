// Knowledge Base — multi-source UI.
// Sources: manual text, URL crawl, PDF upload, FAQ Q&A.
// Each source is automatically chunked + embedded for AI retrieval.

'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { useConfirm } from '@/components/confirm-dialog'
import {
  BookOpen, Plus, FileText, Globe, Upload as UploadIcon, MessageCircleQuestion,
  Trash2, Save, Loader2, RefreshCw, AlertCircle, CheckCircle2, Clock, Search,
  Sparkles, ChevronDown, ChevronRight, X, Wand2, Lightbulb
} from 'lucide-react'

interface KnowledgeSource {
  id: string
  type: 'manual' | 'url' | 'pdf' | 'faq' | 'text'
  title: string
  sourceUrl: string | null
  status: 'processing' | 'ready' | 'failed'
  errorMessage: string | null
  chunkCount: number
  createdAt: string
  updatedAt: string
}

const TYPE_ICONS = {
  manual: FileText,
  text: FileText,
  faq: MessageCircleQuestion,
  url: Globe,
  pdf: UploadIcon,
} as const

const TYPE_LABELS = {
  manual: 'Manual text',
  text: 'Text',
  faq: 'Q&A',
  url: 'Website URL',
  pdf: 'PDF document',
} as const

export function KnowledgeManager() {
  const { confirm } = useConfirm()
  const { toast } = useToast()
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<null | 'manual' | 'url' | 'pdf' | 'faq'>(null)
  const [draft, setDraft] = useState<{ title: string; content: string; sourceUrl: string }>({ title: '', content: '', sourceUrl: '' })
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const [testResults, setTestResults] = useState<{ content: string; sourceTitle: string; score: number }[]>([])
  const [testing, setTesting] = useState(false)
  const [suggestingFAQs, setSuggestingFAQs] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/knowledge/sources')
      const data = await res.json()
      setSources(data.sources || [])
    } finally { setLoading(false) }
  }

  const startAdd = (kind: 'manual' | 'url' | 'pdf' | 'faq') => {
    setAdding(kind)
    setDraft({ title: '', content: '', sourceUrl: '' })
  }

  const save = async () => {
    setSaving(true)
    try {
      const body: any = { type: adding === 'faq' ? 'faq' : (adding === 'manual' ? 'manual' : adding) }
      if (adding === 'url') body.sourceUrl = draft.sourceUrl
      else body.title = draft.title
      body.content = draft.content

      const res = await fetch('/api/knowledge/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      toast({
        title: adding === 'url' ? 'URL crawled' : 'Source added',
        description: 'AI is indexing this content — usually takes a few seconds',
        variant: 'success',
      })
      setAdding(null)
      setDraft({ title: '', content: '', sourceUrl: '' })
      load()
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const uploadPdf = async (file: File) => {
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      if (draft.title) form.append('title', draft.title)
      const res = await fetch('/api/knowledge/sources/upload', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      toast({
        title: 'PDF uploaded',
        description: `Extracted ${data.pageCount} pages — AI is indexing now`,
        variant: 'success',
      })
      setAdding(null)
      setDraft({ title: '', content: '', sourceUrl: '' })
      load()
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (s: KnowledgeSource) => {
    if (!(await confirm({
      title: `Remove "${s.title}"?`,
      message: 'The AI will stop using this source for replies immediately. Existing conversations are not affected.',
      confirmText: 'Remove',
      destructive: true,
    }))) return
    try {
      await fetch(`/api/knowledge/sources/${s.id}`, { method: 'DELETE' })
      toast({ title: 'Removed', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'error' })
    }
  }

  const reingest = async (s: KnowledgeSource) => {
    try {
      await fetch(`/api/knowledge/sources/${s.id}`, { method: 'POST' })
      toast({ title: 'Re-indexing started', variant: 'success' })
      load()
    } catch (err: any) {
      toast({ title: 'Failed', description: err.message, variant: 'error' })
    }
  }

  const testRetrieve = async () => {
    if (!testQuery.trim()) return
    setTesting(true)
    try {
      const res = await fetch('/api/knowledge/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery, topK: 4 }),
      })
      const data = await res.json()
      setTestResults(data.chunks || [])
    } finally {
      setTesting(false)
    }
  }

  const suggestFAQs = async () => {
    setSuggestingFAQs(true)
    try {
      const res = await fetch('/api/ai/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Generate 10 common questions customers ask a small Indian business on WhatsApp. For each, provide a concise placeholder answer (1 sentence). Format: Q: ... | A: ...',
        }),
      })
      const data = await res.json()
      if (data.response) {
        // Parse Q|A pairs and convert to our text format
        const faqText = data.response
          .split('\n')
          .filter((l: string) => l.trim())
          .map((l: string) => l.replace(/^(Q:|A:)/gm, '').trim())
          .join('\n')
        setDraft({
          title: draft.title || 'Common customer questions',
          content: faqText,
          sourceUrl: '',
        })
        setAdding('faq')
        toast({ title: 'FAQs generated', description: 'Review and save', variant: 'success' })
      }
    } catch (err) {
      toast({ title: 'AI failed', variant: 'error' })
    } finally {
      setSuggestingFAQs(false)
    }
  }

  const ready = sources.filter((s) => s.status === 'ready')
  const totalChunks = ready.reduce((acc, s) => acc + s.chunkCount, 0)

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-teal-600" />
            Knowledge Base
          </h1>
          <p className="text-ink-600 mt-1">
            Train your AI on your business. Add documents, FAQs, or your website — AI uses them for every reply.
          </p>
        </div>
      </div>

      {/* Stats + Add buttons */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            <div className="text-2xl font-bold text-ink-900">{ready.length}</div>
            <div className="text-xs text-ink-500">sources indexed · {totalChunks} chunks</div>
          </div>
          <Button variant="outline" onClick={() => startAdd('manual')}><FileText className="w-4 h-4" />Add text</Button>
          <Button variant="outline" onClick={() => startAdd('faq')}><MessageCircleQuestion className="w-4 h-4" />Add Q&A</Button>
          <Button variant="outline" onClick={() => startAdd('url')}><Globe className="w-4 h-4" />Crawl URL</Button>
          <Button variant="brand" onClick={() => { setAdding('pdf'); fileInputRef.current?.click() }}>
            <UploadIcon className="w-4 h-4" />Upload PDF
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPdf(f) }}
          />
        </CardContent>
      </Card>

      {/* Test retrieval */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-teal-600" />
            Test what your AI knows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && testRetrieve()}
              placeholder='Try: "Do you accept insurance?" or "What are your hours?"'
            />
            <Button variant="brand" onClick={testRetrieve} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Test
            </Button>
          </div>
          {testResults.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-ink-500">Top matches your AI will use:</div>
              {testResults.map((r, i) => (
                <div key={i} className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-semibold text-teal-700">{r.sourceTitle}</div>
                    <div className="text-xs text-teal-600">score: {r.score.toFixed(2)}</div>
                  </div>
                  <div className="text-sm text-ink-700 line-clamp-3">{r.content}</div>
                </div>
              ))}
            </div>
          )}
          {testResults.length === 0 && testQuery && !testing && (
            <div className="text-xs text-ink-500 italic">No matches found. Add more sources or rephrase.</div>
          )}
        </CardContent>
      </Card>

      {/* Add new source modal */}
      {adding && (
        <Card className="border-teal-200 bg-teal-50/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Add {TYPE_LABELS[adding]}</span>
              <Button variant="ghost" size="icon" onClick={() => setAdding(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {adding === 'url' ? (
              <>
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Website URL</label>
                  <Input
                    value={draft.sourceUrl}
                    onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })}
                    placeholder="https://yoursite.com/about"
                  />
                  <p className="text-xs text-ink-500 mt-1">
                    We'll fetch the page, extract the text, and add it to your knowledge base.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Title (optional)</label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Defaults to page title"
                  />
                </div>
              </>
            ) : adding === 'pdf' ? (
              <div className="text-sm text-ink-600">
                <p>Click "Upload PDF" or the upload button above to choose a PDF file.</p>
                <p className="text-xs mt-1">Max 25MB. We'll extract text and index for AI use.</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-medium text-ink-600 mb-1.5 block">Title</label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={adding === 'faq' ? 'e.g. Common questions' : 'e.g. Pricing policy'}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-ink-600">
                      {adding === 'faq' ? 'Questions & Answers (Q on one line, A on next)' : 'Content'}
                    </label>
                    {adding === 'faq' && (
                      <Button size="sm" variant="ghost" onClick={suggestFAQs} disabled={suggestingFAQs}>
                        {suggestingFAQs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        AI suggest
                      </Button>
                    )}
                  </div>
                  <textarea
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm min-h-[200px] font-mono"
                    value={draft.content}
                    onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                    placeholder={
                      adding === 'faq'
                        ? 'Q: Do you accept insurance?\nA: Yes, all major insurers.\n\nQ: What are your hours?\nA: Mon-Sat 9 AM - 8 PM.'
                        : 'Paste any text — service descriptions, policies, FAQs, tone notes...'
                    }
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="brand" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {adding === 'url' ? 'Crawl & save' : 'Save'}
              </Button>
              <Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources list */}
      <div className="space-y-2">
        {loading ? (
          <Card><CardContent className="p-8 text-center text-ink-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></CardContent></Card>
        ) : sources.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Lightbulb className="w-12 h-12 text-ink-300 mx-auto mb-3" />
              <p className="text-ink-700 font-medium">No knowledge sources yet</p>
              <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
                Add your website, a service menu PDF, or a list of FAQs. Your AI will use these to answer customer questions accurately.
              </p>
            </CardContent>
          </Card>
        ) : (
          sources.map((s) => {
            const Icon = TYPE_ICONS[s.type] || FileText
            return (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 text-ink-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink-900">{s.title}</span>
                        <span className="text-xs text-ink-500">{TYPE_LABELS[s.type]}</span>
                        {s.status === 'ready' && (
                          <span className="inline-flex items-center gap-1 text-xs text-teal-700">
                            <CheckCircle2 className="w-3 h-3" />{s.chunkCount} chunks
                          </span>
                        )}
                        {s.status === 'processing' && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Loader2 className="w-3 h-3 animate-spin" />Indexing…
                          </span>
                        )}
                        {s.status === 'failed' && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-700">
                            <AlertCircle className="w-3 h-3" />Failed
                          </span>
                        )}
                      </div>
                      {s.sourceUrl && (
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline truncate block">
                          {s.sourceUrl}
                        </a>
                      )}
                      {s.errorMessage && (
                        <div className="text-xs text-red-600 mt-1">{s.errorMessage}</div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => reingest(s)} title="Re-index">
                        <RefreshCw className="w-3 h-3" />
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
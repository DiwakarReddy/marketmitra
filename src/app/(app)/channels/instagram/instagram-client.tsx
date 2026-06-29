'use client'

// Instagram channel client — caption generator + DM automation settings.
// All AI calls go through /api/ai/instagram which uses the business's own key
// (or platform key as fallback). No templates, no stubs — real AI work.

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Sparkles, Loader2, Copy, RefreshCw, CheckCircle2, MessageCircle, Wand2, Instagram } from 'lucide-react'

interface Props {
  connected: boolean
  channelConfigId: string | null
}

type Tone = 'casual' | 'professional' | 'festive' | 'educational' | 'before_after'

export function InstagramClient({ connected, channelConfigId }: Props) {
  const { toast } = useToast()
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState<Tone>('casual')
  const [generating, setGenerating] = useState(false)
  const [captions, setCaptions] = useState<string[]>([])
  const [autoDmEnabled, setAutoDmEnabled] = useState(false)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)

  const generate = async () => {
    if (!connected) {
      toast({ title: 'Connect Instagram first', description: 'Go to Settings → Integrations → Instagram to connect your account.', variant: 'error' })
      return
    }
    if (!topic.trim()) {
      toast({ title: 'Describe the post topic', description: 'e.g. "5 tips for healthier teeth" or "Our Diwali offer on cleaning"', variant: 'error' })
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/instagram-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setCaptions(data.captions || [])
      if (data.captions?.length === 0) {
        toast({ title: 'AI returned empty captions', description: 'Try a more specific topic — e.g. "Diwali offer on dental cleaning".', variant: 'error' })
      }
    } catch (err: any) {
      toast({ title: 'Caption generation failed', description: err.message, variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard', variant: 'success' })
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    try {
      const res = await fetch('/api/channels/instagram/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoDmEnabled, autoReplyEnabled }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }
      toast({ title: 'Settings saved', variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'error' })
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Caption Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Caption Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-700">What's the post about?</label>
            <Input
              placeholder="e.g. 5 tips for healthier teeth, Diwali offer on cleaning, before/after smile makeover"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-700">Tone</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {([
                { k: 'casual', label: 'Casual' },
                { k: 'professional', label: 'Professional' },
                { k: 'festive', label: 'Festive' },
                { k: 'educational', label: 'Educational' },
                { k: 'before_after', label: 'Before/After' },
              ] as { k: Tone; label: string }[]).map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTone(t.k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    tone === t.k
                      ? 'bg-pink-600 text-white border-pink-600'
                      : 'bg-white text-ink-700 border-ink-200 hover:bg-ink-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={generate} disabled={generating} variant="brand" className="w-full">
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating 3 captions…</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" />Generate captions</>
            )}
          </Button>

          {captions.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-ink-700 uppercase tracking-wider flex items-center justify-between">
                <span>AI Drafts ({captions.length})</span>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Regenerate
                </button>
              </div>
              {captions.map((c, i) => (
                <div key={i} className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{c}</p>
                    <Button size="sm" variant="ghost" onClick={() => copy(c)} className="flex-shrink-0">
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="mt-1 text-[10px] text-ink-500">{c.length} chars · variant {i + 1}</div>
                </div>
              ))}
            </div>
          )}

          {!connected && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              💡 Connect your Instagram account first to enable AI caption generation.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Automation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-pink-600" />
            Automation Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SettingToggle
            label="Auto-reply to comments"
            desc="AI responds to common comments like 'price?', 'timings?', 'how to book?'"
            enabled={autoReplyEnabled}
            onChange={setAutoReplyEnabled}
          />
          <SettingToggle
            label="Convert DMs to WhatsApp leads"
            desc="When someone DMs about a service, AI offers to continue on WhatsApp"
            enabled={autoDmEnabled}
            onChange={setAutoDmEnabled}
          />

          <div className="pt-2 border-t border-ink-100 flex justify-end">
            <Button onClick={saveSettings} disabled={savingSettings || !connected} variant="brand">
              {savingSettings ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingToggle({ label, desc, enabled, onChange }: { label: string; desc: string; enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 border border-ink-100 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-ink-900">{label}</div>
        <div className="text-xs text-ink-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ${
          enabled ? 'bg-teal-600' : 'bg-ink-200'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}
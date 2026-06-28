'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Copy, ExternalLink, Code, Check, Palette, Type, MessageSquare, Eye, Loader2 } from 'lucide-react'

export function WidgetCustomizer({ businessId, businessName, businessCity }: { businessId: string; businessName: string; businessCity: string }) {
  const { toast } = useToast()
  const [theme, setTheme] = useState({
    primaryColor: '#0d9488',
    buttonText: '📅 Book Appointment',
    position: 'bottom-right' as 'bottom-right' | 'bottom-left',
    accentColor: '#0f766e',
    buttonStyle: 'rounded' as 'rounded' | 'square' | 'pill',
  })
  const [copied, setCopied] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)

  const embedCode = `<!-- Add this before </body> on your website -->
<script src="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.marketmitra.com'}/widget/embed.js"
        data-business-id="${businessId}"
        data-primary-color="${theme.primaryColor}"
        data-button-text="${theme.buttonText}"
        data-position="${theme.position}"
        data-button-style="${theme.buttonStyle}"
        async></script>`

  const copy = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    toast({ title: 'Embed code copied!', variant: 'success' })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">Booking Widget</h1>
        <p className="text-ink-600 mt-1">Drop one line of code on your website. Customers book themselves 24/7.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Customize */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-teal-600" />Customize</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Button color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.primaryColor}
                    onChange={(e) => { setTheme({ ...theme, primaryColor: e.target.value }); setPreviewKey(previewKey + 1) }}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <Input
                    value={theme.primaryColor}
                    onChange={(e) => { setTheme({ ...theme, primaryColor: e.target.value }); setPreviewKey(previewKey + 1) }}
                    className="font-mono"
                  />
                </div>
                <div className="flex gap-1 mt-2">
                  {['#0d9488', '#7c3aed', '#dc2626', '#ea580c', '#0891b2', '#16a34a', '#1e40af', '#be185d'].map((c) => (
                    <button
                      key={c}
                      onClick={() => { setTheme({ ...theme, primaryColor: c }); setPreviewKey(previewKey + 1) }}
                      className="w-6 h-6 rounded border border-ink-200"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">
                  <Type className="w-3 h-3 inline mr-1" />Button text
                </label>
                <Input
                  value={theme.buttonText}
                  onChange={(e) => { setTheme({ ...theme, buttonText: e.target.value }); setPreviewKey(previewKey + 1) }}
                  placeholder="📅 Book Appointment"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Position</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: 'bottom-right', label: '↘ Bottom right' },
                    { v: 'bottom-left', label: '↙ Bottom left' },
                  ].map((p) => (
                    <button
                      key={p.v}
                      onClick={() => { setTheme({ ...theme, position: p.v as any }); setPreviewKey(previewKey + 1) }}
                      className={`p-2 border-2 rounded-lg text-sm ${
                        theme.position === p.v ? 'border-teal-500 bg-teal-50' : 'border-ink-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-ink-600 mb-1.5 block">Button shape</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'rounded', label: 'Rounded' },
                    { v: 'square', label: 'Square' },
                    { v: 'pill', label: 'Pill' },
                  ].map((s) => (
                    <button
                      key={s.v}
                      onClick={() => { setTheme({ ...theme, buttonStyle: s.v as any }); setPreviewKey(previewKey + 1) }}
                      className={`p-2 border-2 rounded-lg text-sm ${
                        theme.buttonStyle === s.v ? 'border-teal-500 bg-teal-50' : 'border-ink-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Code className="w-5 h-5 text-teal-600" />Embed code</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="p-3 bg-ink-50 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                {embedCode}
              </pre>
              <div className="flex gap-2 mt-3">
                <Button variant="brand" onClick={copy} className="flex-1">
                  {copied ? <><Check className="w-4 h-4" />Copied!</> : <><Copy className="w-4 h-4" />Copy</>}
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/widget/preview?businessId=${businessId}`} target="_blank">
                    <ExternalLink className="w-4 h-4" />Test
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What happens after install</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-ink-700">
              <p>✅ Floating button appears on your website</p>
              <p>✅ Customer picks service + time slot</p>
              <p>✅ Customer enters name + phone (Indian mobile validated)</p>
              <p>✅ Booking appears in your calendar + /dashboard</p>
              <p>✅ WhatsApp confirmation sent automatically</p>
              <p>✅ Reminder 24h before appointment</p>
              <p>✅ You can disable/enable anytime</p>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-teal-600" />Live preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative bg-gradient-to-br from-ink-100 to-ink-50 rounded-lg p-8 min-h-[500px] border border-ink-200" key={previewKey}>
                {/* Mock website */}
                <div className="bg-white rounded-lg p-4 shadow-sm mb-4">
                  <div className="text-xs text-ink-500 mb-1">Your website</div>
                  <div className="font-bold text-ink-900">{businessName}</div>
                  <div className="text-xs text-ink-500 mt-0.5">📍 {businessCity}</div>
                  <div className="mt-3 space-y-1">
                    <div className="h-2 bg-ink-100 rounded w-3/4" />
                    <div className="h-2 bg-ink-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded p-2 text-xs">Services</div>
                  <div className="bg-white rounded p-2 text-xs">About</div>
                </div>
                <div className="mt-2 bg-white rounded p-2 text-xs">Contact</div>

                {/* The widget button */}
                <button
                  className="absolute font-semibold text-white shadow-lg transition transform hover:scale-105 flex items-center gap-1.5"
                  style={{
                    backgroundColor: theme.primaryColor,
                    [theme.position === 'bottom-right' ? 'right' : 'left']: '20px',
                    bottom: '20px',
                    padding: '14px 20px',
                    fontSize: '15px',
                    borderRadius: theme.buttonStyle === 'pill' ? '999px' : theme.buttonStyle === 'square' ? '4px' : '12px',
                  }}
                >
                  {theme.buttonText}
                </button>
              </div>
              <p className="text-xs text-ink-500 mt-2 text-center">
                Click the button in your live site to test the booking flow
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
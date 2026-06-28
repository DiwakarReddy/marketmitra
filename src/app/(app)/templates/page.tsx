import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TemplatesClient } from './templates-client'

export const dynamic = 'force-dynamic'

export default function TemplatesPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">WhatsApp Templates</h1>
        <p className="text-ink-600 mt-1">
          Approved message templates from your Meta WhatsApp Business account. Variables like <code className="px-1.5 py-0.5 bg-ink-100 rounded text-xs">{'{{1}}'}</code> are replaced with real values at send time.
        </p>
      </div>

      <TemplatesClient />
    </div>
  )
}
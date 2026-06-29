import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TemplatesClient } from './templates-client'

export const dynamic = 'force-dynamic'

export default function TemplatesPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">Templates</h1>
        <p className="text-ink-600 mt-1">
          Reusable WhatsApp / SMS / Email templates with <code className="px-1.5 py-0.5 bg-ink-100 rounded text-xs">{'{{tokens}}'}</code> that auto-fill per customer.
          Use them in campaigns, drip sequences, and one-off sends.
        </p>
      </div>

      <TemplatesClient />
    </div>
  )
}
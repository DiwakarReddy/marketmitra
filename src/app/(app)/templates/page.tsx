import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TemplateEditor } from './template-editor'

// Pre-built templates
const TEMPLATES = [
  {
    name: 'reactivation_v1',
    category: 'MARKETING',
    language: 'hi',
    status: 'approved',
    body: 'नमस्ते {{1}} जी! 🙏 आप {{2}} से हमारे पास आए थे {{3}} के लिए। {{4}} महीने हो गए — एक visit plan करें! Special {{5}}% off. Book: {{6}}',
    variables: ['name', 'last_visit_date', 'service', 'months_since', 'discount_pct', 'booking_link'],
    example: 'नमस्ते रिया जी! 🙏 आप 15 जनवरी से हमारे पास आए थे Dental Cleaning के लिए। 6 महीने हो गए — एक visit plan करें! Special 20% off. Book: https://...',
  },
  {
    name: 'birthday_wish',
    category: 'MARKETING',
    language: 'hi',
    status: 'approved',
    body: '🎂 Happy Birthday {{1}}! {{businessName}} की ओर से {{2}}% off आपके अगले visit पर। जन्मदिन मुबारक हो! 🎉',
    variables: ['name', 'discount_pct'],
    example: '🎂 Happy Birthday {{1}}! {{businessName}} की ओर से 10% off आपके अगले visit पर। जन्मदिन मुबारक हो! 🎉',
  },
  {
    name: 'review_request',
    category: 'MARKETING',
    language: 'hi',
    status: 'approved',
    body: '{{1}} जी, {{2}} के लिए धन्यवाद! 🙏 आपका 2 मिनट का review हमारे लिए बहुत मायने रखता है: {{3}}',
    variables: ['name', 'service', 'review_link'],
    example: 'सुनीता जी, Dental Consultation के लिए धन्यवाद! 🙏 आपका 2 मिनट का review हमारे लिए बहुत मायने रखता है: https://g.page/...',
  },
  {
    name: 'booking_confirmation',
    category: 'UTILITY',
    language: 'hi',
    status: 'approved',
    body: '✓ {{1}} जी, आपकी appointment confirm है!\n\n📅 {{2}} at {{3}}\n👤 {{4}}\n📞 {{5}}\n🦷 {{6}}\n\nकुछ बदलना हो तो reply करें।',
    variables: ['name', 'date', 'time', 'name_again', 'phone', 'service'],
    example: '✓ रिया जी, आपकी appointment confirm है!\n\n📅 Sunday, 28 June at 2:00 PM\n👤 {{1}}\n📞 {{phone}}\n🦷 Dental Consultation\n\nकुछ बदलना हो तो reply करें।',
  },
  {
    name: 'appointment_reminder',
    category: 'UTILITY',
    language: 'hi',
    status: 'approved',
    body: '🔔 Reminder: {{1}} जी, कल {{2}} पर आपका appointment है ({{3}}).\n\n✅ Confirm: "YES"\n🔄 Reschedule: "RESCHEDULE"\n❌ Cancel: "CANCEL"',
    variables: ['name', 'datetime', 'service'],
    example: '🔔 Reminder: रिया जी, कल 2:00 PM पर आपका appointment है (Dental Consultation).\n\n✅ Confirm: "YES"\n🔄 Reschedule: "RESCHEDULE"\n❌ Cancel: "CANCEL"',
  },
  {
    name: 'festival_offer',
    category: 'MARKETING',
    language: 'hi',
    status: 'approved',
    body: '🪔 {{1}} की हार्दिक शुभकामनाएं!\n\n{{2}} की ओर से {{3}}% की विशेष छूट — सीमित समय के लिए।\n\nBook: {{4}}',
    variables: ['festival_name', 'business_name', 'discount_pct', 'booking_link'],
    example: '🪔 दीवाली की हार्दिक शुभकामनाएं!\n\n{{businessName}} की ओर से 15% की विशेष छूट — सीमित समय के लिए।\n\nBook: https://...',
  },
]

const STATUS_VARIANT: Record<string, any> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  draft: 'secondary',
}

export default function TemplatesPage() {
  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-ink-900">WhatsApp Templates</h1>
        <p className="text-ink-600 mt-1">Pre-approved message templates for AI to use. Edit any template below — changes apply to future sends.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((t) => (
          <TemplateEditor key={t.name} template={t} statusVariant={STATUS_VARIANT[t.status] || 'secondary'} />
        ))}
      </div>
    </div>
  )
}
// Fallback screen shown when WhatsApp is not configured.
// Guides the user to /channels/whatsapp to set up.

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquare, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'

export function InboxNotConfigured() {
  return (
    <div className="h-full flex items-center justify-center bg-ink-50/50 p-6">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-8 text-center">
          <div className="w-20 h-20 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-10 h-10 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900 mb-2">Connect WhatsApp to see your inbox</h1>
          <p className="text-ink-600 max-w-md mx-auto mb-6">
            Your WhatsApp inbox shows every customer conversation, with AI auto-replies and quick actions.
            Set up takes 5 minutes — connect your Meta WhatsApp Business API, AiSensy, or 360dialog.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 text-left">
            <div className="p-3 bg-ink-50 rounded-lg">
              <Sparkles className="w-5 h-5 text-teal-600 mb-1" />
              <div className="text-sm font-semibold text-ink-900">AI replies 24/7</div>
              <div className="text-xs text-ink-500">Hinglish, Hindi, 9 more languages</div>
            </div>
            <div className="p-3 bg-ink-50 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-teal-600 mb-1" />
              <div className="text-sm font-semibold text-ink-900">Auto-booking</div>
              <div className="text-xs text-ink-500">Customers book via chat</div>
            </div>
            <div className="p-3 bg-ink-50 rounded-lg">
              <MessageSquare className="w-5 h-5 text-teal-600 mb-1" />
              <div className="text-sm font-semibold text-ink-900">Smart labels</div>
              <div className="text-xs text-ink-500">VIP, follow-up, complaint</div>
            </div>
          </div>

          <Button asChild variant="brand" size="lg">
            <Link href="/channels/whatsapp">
              Connect WhatsApp <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <p className="text-xs text-ink-500 mt-4">
            Don't have a Meta WhatsApp Business account?{' '}
            <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noopener" className="text-teal-700 underline">
              Set one up here
            </a>
            {' '}— it's free.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
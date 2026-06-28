// Per-channel credential schema
// Each channel knows what fields it needs and how to test itself

export interface ChannelField {
  key: string
  label: string
  type: 'text' | 'password' | 'tel' | 'url'
  required: boolean
  placeholder?: string
  helpText?: string
}

export interface ChannelSchema {
  channel: string
  label: string
  icon: string
  description: string
  providers?: { value: string; label: string }[]
  fields: ChannelField[]
  // How to test the connection
  testInstructions?: string
}

export const CHANNEL_SCHEMAS: Record<string, ChannelSchema> = {
  whatsapp: {
    channel: 'whatsapp',
    label: 'WhatsApp Business',
    icon: '💬',
    description: 'Send & receive WhatsApp messages via Meta Cloud API, AiSensy, or 360dialog.',
    providers: [
      { value: 'meta', label: 'Meta Cloud API (free, recommended)' },
      { value: 'aisensy', label: 'AiSensy (paid, easier)' },
      { value: '360dialog', label: '360dialog (paid)' },
      { value: 'twilio', label: 'Twilio WhatsApp' },
    ],
    fields: [
      { key: 'phoneNumberId', label: 'Phone Number ID', type: 'text', required: true, placeholder: '123456789012345', helpText: 'From Meta Business Manager → WhatsApp → Phone Numbers' },
      { key: 'whatsappBusinessId', label: 'WhatsApp Business Account ID', type: 'text', required: false, placeholder: '987654321098765' },
      { key: 'accessToken', label: 'Permanent Access Token', type: 'password', required: true, helpText: 'Generate from Meta Business Manager → System Users' },
      { key: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'password', required: false, helpText: 'Any random string, set same in Meta webhook config' },
    ],
    testInstructions: 'After connecting, set webhook URL in Meta to: https://yourdomain.com/api/whatsapp/webhook',
  },

  voice: {
    channel: 'voice',
    label: 'Voice AI (Twilio)',
    icon: '📞',
    description: 'AI-driven outbound phone calls for reactivation campaigns.',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', required: true, placeholder: 'ACxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'Auth Token', type: 'password', required: true },
      { key: 'phoneNumber', label: 'Twilio Phone Number', type: 'tel', required: true, placeholder: '+919876543210' },
    ],
    testInstructions: 'After connecting, configure voice webhook in Twilio console.',
  },

  instagram: {
    channel: 'instagram',
    label: 'Instagram',
    icon: '📸',
    description: 'AI auto-posts content and replies to DMs.',
    fields: [
      { key: 'businessAccountId', label: 'Instagram Business Account ID', type: 'text', required: true },
      { key: 'accessToken', label: 'Long-lived Access Token', type: 'password', required: true, helpText: 'Generate from Facebook Graph API Explorer' },
    ],
  },

  google_ads: {
    channel: 'google_ads',
    label: 'Google Ads',
    icon: '🎯',
    description: 'AI manages your Google Ads campaigns 24/7.',
    fields: [
      { key: 'developerToken', label: 'Developer Token', type: 'password', required: true, helpText: 'Apply at ads.google.com/aw/apicenter' },
      { key: 'customerId', label: 'Customer ID (no dashes)', type: 'text', required: true, placeholder: '1234567890' },
      { key: 'clientId', label: 'OAuth Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'OAuth Client Secret', type: 'password', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: true },
    ],
  },

  google_calendar: {
    channel: 'google_calendar',
    label: 'Google Calendar',
    icon: '📅',
    description: 'Sync appointments to your Google Calendar automatically.',
    fields: [
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: true },
      { key: 'calendarId', label: 'Calendar ID', type: 'text', required: false, placeholder: 'primary (or calendar email)', helpText: 'Leave as "primary" to use your main calendar' },
    ],
  },

  razorpay: {
    channel: 'razorpay',
    label: 'Razorpay',
    icon: '💳',
    description: 'Accept payments from customers (per-booking billing).',
    fields: [
      { key: 'keyId', label: 'Key ID', type: 'text', required: true, placeholder: 'rzp_live_xxxxx or rzp_test_xxxxx' },
      { key: 'keySecret', label: 'Key Secret', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false, helpText: 'Found in Razorpay Dashboard → Webhooks' },
    ],
  },

  openai: {
    channel: 'openai',
    label: 'OpenAI (AI)',
    icon: '🧠',
    description: 'Use your own OpenAI account for AI responses. (Skip to use platform key)',
    fields: [
      { key: 'apiKey', label: 'OpenAI API Key', type: 'password', required: true, placeholder: 'sk-...' },
    ],
  },

  google_ai: {
    channel: 'google_ai',
    label: 'Google AI (Gemini)',
    icon: '✨',
    description: 'Use your own Google AI Studio account. (Skip to use platform key)',
    fields: [
      { key: 'apiKey', label: 'Google AI API Key', type: 'password', required: true, placeholder: 'AIzaSy...' },
    ],
  },
}

export const CHANNEL_ORDER = [
  'whatsapp',
  'voice',
  'instagram',
  'google_ads',
  'google_calendar',
  'razorpay',
  'openai',
  'google_ai',
]

export function getChannelSchema(channel: string): ChannelSchema | null {
  return CHANNEL_SCHEMAS[channel] || null
}
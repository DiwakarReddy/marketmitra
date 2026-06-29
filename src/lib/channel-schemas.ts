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
      { key: 'accessToken', label: 'Permanent Access Token', type: 'password', required: true, helpText: 'Generate from Meta Business Manager → System Users (needs whatsapp_business_management + whatsapp_business_messaging scopes)' },
      { key: 'appSecret', label: 'Meta App Secret (recommended)', type: 'password', required: false, helpText: 'Required to verify webhook signatures. Find in Meta Developer Portal → App Settings → Basic → App Secret. Get from your META APP, not the access token.' },
      { key: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'password', required: false, helpText: 'Any random string you also enter in Meta webhook config. Used for webhook URL verification, not signing.' },
    ],
    testInstructions: 'After connecting: (1) set webhook URL in Meta to https://yourdomain.com/api/whatsapp/webhook, (2) paste the App Secret above for signature verification, (3) subscribe to messages + message_status events.',
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

  sms: {
    channel: 'sms',
    label: 'SMS',
    icon: '💬',
    description: 'Send SMS to customers who don\'t use WhatsApp. Supports Twilio, MSG91 (DLT for India), Plivo.',
    providers: [
      { value: 'twilio', label: 'Twilio (global, recommended for non-India)' },
      { value: 'msg91', label: 'MSG91 (India, DLT templates supported)' },
      { value: 'plivo', label: 'Plivo (global, cheaper for high volume)' },
    ],
    fields: [
      { key: 'accountSid', label: 'Account SID / Auth ID', type: 'text', required: false, placeholder: 'ACxxx (Twilio) or Auth ID (Plivo)' },
      { key: 'authToken', label: 'Auth Token (Twilio/Plivo)', type: 'password', required: false, helpText: 'Required for Twilio and Plivo' },
      { key: 'fromNumber', label: 'From Number', type: 'tel', required: false, placeholder: '+14155551234', helpText: 'Required for Twilio/Plivo' },
      { key: 'authKey', label: 'MSG91 Auth Key', type: 'password', required: false, helpText: 'Required for MSG91 — find in MSG91 dashboard' },
      { key: 'senderId', label: 'MSG91 Sender ID (6-char alpha)', type: 'text', required: false, placeholder: 'MKTMSG', helpText: 'DLT-registered sender ID. Required for India.' },
      { key: 'dltTemplateId', label: 'MSG91 DLT Template ID', type: 'text', required: false, placeholder: '1107161234567890123', helpText: 'Required for India DLT compliance' },
    ],
    testInstructions: 'After connecting, you can send SMS via campaigns, drips, and AI responses. For India, use MSG91 with DLT-registered template ID.',
  },

  email: {
    channel: 'email',
    label: 'Email',
    icon: '📧',
    description: 'Send emails for invoices, summaries, and customer outreach. Supports Resend and AWS SES.',
    providers: [
      { value: 'resend', label: 'Resend (recommended, best DX)' },
      { value: 'ses', label: 'AWS SES (cheaper at scale)' },
    ],
    fields: [
      { key: 'apiKey', label: 'Resend API Key', type: 'password', required: false, helpText: 'Required for Resend. Get from resend.com/api-keys' },
      { key: 'fromAddress', label: 'From Address', type: 'text', required: false, placeholder: 'Your Business <hello@yourdomain.com>', helpText: 'Must be a verified domain in Resend/SES' },
      { key: 'accessKeyId', label: 'AWS Access Key ID', type: 'text', required: false, helpText: 'Required for SES — has ses:SendEmail permission' },
      { key: 'secretAccessKey', label: 'AWS Secret Access Key', type: 'password', required: false, helpText: 'Required for SES' },
    ],
    testInstructions: 'After connecting, you can send email via campaigns, drips, booking confirmations, and payment receipts.',
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
  'sms',
  'email',
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
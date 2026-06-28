// Environment variable validation
// Runs on first request, fails fast in production if config is missing

interface EnvConfig {
  // Required in all environments
  DATABASE_URL: string
  NEXTAUTH_SECRET: string
  NEXTAUTH_URL: string
  ENCRYPTION_KEY: string

  // Required in production
  ADMIN_EMAIL?: string

  // AI (at least one required)
  GOOGLE_API_KEY?: string
  OPENAI_API_KEY?: string

  // WhatsApp (optional — defaults to mock mode)
  WHATSAPP_PROVIDER?: 'meta' | 'aisensy' | '360dialog' | 'twilio'
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_API_KEY?: string
  WHATSAPP_APP_SECRET?: string

  // Cron security
  CRON_SECRET?: string

  // Founder admin (gates /admin pages)
}

let validated = false

export function validateEnv(): void {
  if (validated) return
  validated = true

  const errors: string[] = []
  const warnings: string[] = []

  // Critical: must have
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required')
  if (!process.env.NEXTAUTH_SECRET) errors.push('NEXTAUTH_SECRET is required (generate with: openssl rand -base64 32)')
  if (!process.env.NEXTAUTH_URL) errors.push('NEXTAUTH_URL is required (e.g., https://app.marketmitra.com)')
  if (!process.env.ENCRYPTION_KEY) errors.push('ENCRYPTION_KEY is required (generate with: openssl rand -hex 32)')

  // Production-only checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.NEXTAUTH_URL?.startsWith('http://')) {
      errors.push('NEXTAUTH_URL must use https:// in production')
    }
    if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 64) {
      errors.push('ENCRYPTION_KEY must be 64 hex chars (32 bytes) — got ' + process.env.ENCRYPTION_KEY.length)
    }
    if (!process.env.CRON_SECRET) {
      warnings.push('CRON_SECRET not set — cron endpoints will be open (only safe behind Vercel auth)')
    }
  }

  // AI: at least one key
  if (!process.env.GOOGLE_API_KEY && !process.env.OPENAI_API_KEY) {
    warnings.push('No AI provider key set — AI will fall back to Hinglish templates only')
  }

  // WhatsApp
  const provider = process.env.WHATSAPP_PROVIDER
  if (provider === 'meta') {
    if (!process.env.WHATSAPP_ACCESS_TOKEN) errors.push('WHATSAPP_ACCESS_TOKEN required for Meta provider')
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID) errors.push('WHATSAPP_PHONE_NUMBER_ID required for Meta provider')
  } else if (provider === 'aisensy' || provider === '360dialog') {
    if (!process.env.WHATSAPP_API_KEY) errors.push(`WHATSAPP_API_KEY required for ${provider} provider`)
  } else if (provider && !['meta', 'aisensy', '360dialog', 'twilio'].includes(provider)) {
    errors.push(`Unknown WHATSAPP_PROVIDER: ${provider}`)
  }

  // Log results
  if (errors.length > 0) {
    console.error('\n❌ Environment validation failed:')
    errors.forEach((e) => console.error('  - ' + e))
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Environment validation failed: ' + errors.join(', '))
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:')
    warnings.forEach((w) => console.warn('  - ' + w))
  }
}

// Validate on module load (lazy on first import)
if (typeof window === 'undefined') {
  validateEnv()
}

export const env: EnvConfig = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || '',
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  WHATSAPP_PROVIDER: process.env.WHATSAPP_PROVIDER as any,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  CRON_SECRET: process.env.CRON_SECRET,
}
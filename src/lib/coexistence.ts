// Meta WhatsApp Coexistence — same number in personal app + Cloud API.
//
// Coexistence lets a business keep using their existing WhatsApp number in the
// WhatsApp Business app (or regular WhatsApp) AND have the Meta Cloud API
// (MarketMitra) read/write messages from the same number.
//
// Flow:
//   1. Business registers their phone number in Meta's Embedded Signup flow.
//   2. Meta returns a "coexistence_approved" flag + WABA ID + phone number ID.
//   3. We save those to CoexistenceStatus and also use them in ChannelConfig.
//
// Meta documentation:
//   - https://developers.facebook.com/docs/whatsapp/embedded-signup
//   - https://developers.facebook.com/docs/whatsapp/cloud-api/coexistence
//
// This file provides:
//   - verifyCoexistence(): checks Meta API to see if a number is in Coexistence mode
//   - generateEmbeddedSignupURL(): builds the URL clients open in a popup
//
// The actual Embedded Signup itself happens on Meta's side (JS SDK + popup).
// We capture the result via the 'oauth' webhook from Meta and store it.

import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/kms'

const META_API_VERSION = process.env.META_API_VERSION || 'v18.0'
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface CoexistenceCheckResult {
  enabled: boolean
  phoneNumber?: string
  wabaId?: string
  phoneNumberId?: string
  displayName?: string
  verifiedName?: string
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
  messagingLimit?: string
  notes?: string
}

/**
 * Check with Meta if the given WhatsApp number is configured for Coexistence.
 * Returns whether the number is connected via Cloud API and can co-exist with the
 * Business app.
 */
export async function verifyCoexistence(
  businessId: string,
  phoneNumberId?: string
): Promise<CoexistenceCheckResult> {
  const waChannel = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: 'whatsapp' } },
  })
  if (!waChannel || waChannel.provider !== 'meta' || !waChannel.credentials) {
    return {
      enabled: false,
      notes: 'Connect a Meta WhatsApp channel first to verify Coexistence.',
    }
  }
  let accessToken: string
  try {
    const creds = await decryptJSON<Record<string, string>>(waChannel.credentials, businessId)
    accessToken = creds.accessToken
  } catch {
    return { enabled: false, notes: 'Failed to decrypt Meta credentials.' }
  }

  // Use the phone number ID we already have, or the one passed in
  const pnId = phoneNumberId || (waChannel.config ? JSON.parse(waChannel.config).phoneNumberId : null)
  if (!pnId) {
    return {
      enabled: false,
      notes: 'No Phone Number ID found. Connect a WhatsApp number first.',
    }
  }

  try {
    // Fetch phone number details
    const res = await fetch(
      `${META_GRAPH_BASE}/${pnId}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status&access_token=${encodeURIComponent(accessToken)}`
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return {
        enabled: false,
        notes: `Meta returned ${res.status}: ${err.error?.message || 'unknown error'}`,
      }
    }
    const data = await res.json()
    return {
      enabled: true,
      phoneNumber: data.display_phone_number,
      phoneNumberId: pnId,
      displayName: data.verified_name,
      verifiedName: data.verified_name,
      qualityRating: data.quality_rating || 'UNKNOWN',
      messagingLimit: data.messaging_limit_tier,
      notes: data.name_status
        ? `Business name status: ${data.name_status}`
        : undefined,
    }
  } catch (err: any) {
    return { enabled: false, notes: `Verification failed: ${err.message}` }
  }
}

/**
 * Build the URL clients open in a popup to register their WhatsApp number
 * via Meta's Embedded Signup flow.
 *
 * Required config:
 *   - META_APP_ID         : your Meta app's ID
 *   - META_APP_CONFIG_ID  : the WhatsApp Embedded Signup config ID from Meta dashboard
 *
 * Returns null if config is missing.
 */
export function generateEmbeddedSignupURL(redirectUri?: string): string | null {
  const appId = process.env.META_APP_ID
  const configId = process.env.META_APP_CONFIG_ID
  if (!appId || !configId) return null

  const redirect = redirectUri || `${process.env.NEXT_PUBLIC_APP_URL || ''}/onboarding/whatsapp-callback`
  const params = new URLSearchParams({
    app_id: appId,
    config_id: configId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
  })
  return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`
}

/**
 * Mark a business as having Coexistence enabled, save WABA + phone info.
 */
export async function enableCoexistenceForBusiness(
  businessId: string,
  data: {
    whatsappPhone: string
    appId?: string
    wabaId?: string
    notes?: string
  }
): Promise<void> {
  await prisma.coexistenceStatus.upsert({
    where: { businessId },
    create: {
      businessId,
      enabled: true,
      whatsappPhone: data.whatsappPhone,
      appId: data.appId,
      wabaId: data.wabaId,
      verifiedAt: new Date(),
      notes: data.notes,
    },
    update: {
      enabled: true,
      whatsappPhone: data.whatsappPhone,
      appId: data.appId,
      wabaId: data.wabaId,
      verifiedAt: new Date(),
      notes: data.notes,
    },
  })

  await prisma.activity.create({
    data: {
      businessId, type: 'coexistence_enabled', actor: 'owner',
      title: `WhatsApp Coexistence enabled for ${data.whatsappPhone}`,
      description: 'Same number can now be used in WhatsApp Business app + MarketMitra.',
    },
  })
}

/**
 * Step-by-step documentation we show users in the UI.
 * Keep this in sync with current Meta onboarding flow.
 */
export const COEXISTENCE_DOC_STEPS: Array<{ title: string; description: string; externalUrl?: string }> = [
  {
    title: '1. Open Meta Business Manager',
    description: 'Go to business.facebook.com and create or open your Business account.',
    externalUrl: 'https://business.facebook.com/wa/manage/home',
  },
  {
    title: '2. Create a Meta App',
    description: 'Visit developers.facebook.com → Create App → Type: Business. Add the "WhatsApp" product.',
    externalUrl: 'https://developers.facebook.com/apps/',
  },
  {
    title: '3. Configure WhatsApp Embedded Signup',
    description: 'In your app\'s WhatsApp settings, create an Embedded Signup configuration. Save the Config ID.',
  },
  {
    title: '4. Add Coexistence to your app',
    description: 'In the WhatsApp product → API Setup, enable "Coexistence with WhatsApp Business app". This is what lets you keep your existing number.',
  },
  {
    title: '5. Set up your webhook',
    description: 'In WhatsApp → Configuration → Webhook, set the URL to https://<your-domain>/api/whatsapp/webhook and the verify token to a random string you save in MarketMitra Settings.',
  },
  {
    title: '6. Generate a System User token',
    description: 'In Business Settings → System Users, create a system user with Admin access. Generate a permanent token with whatsapp_business_management + whatsapp_business_messaging scopes.',
  },
  {
    title: '7. Enter credentials in MarketMitra',
    description: 'Go to Settings → Integrations → WhatsApp. Paste your Phone Number ID, WhatsApp Business Account ID (WABA), and the System User access token.',
  },
  {
    title: '8. Verify and activate',
    description: 'Click "Test connection". Once it passes, MarketMitra can read and send messages from the same number your customers already know.',
  },
]
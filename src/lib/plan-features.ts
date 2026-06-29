// Plan-based feature gating
// Each plan unlocks specific features, channels, and capacities
// Single source of truth — used by UI (to hide/show), API (to enforce), and billing

import type { PlanTier } from './plans'

export type Feature =
  | 'whatsapp_inbox'
  | 'whatsapp_broadcasts'
  | 'whatsapp_automations'
  | 'voice_ai'
  | 'instagram'
  | 'google_ads'
  | 'google_calendar'
  | 'razorpay'
  | 'reactivation_ai'
  | 'birthday_wishes'
  | 'festival_campaigns'
  | 'review_requests'
  | 'recurring_appointments'
  | 'no_show_prediction'
  | 'voice_ai_regional'   // Tamil, Telugu, etc.
  | 'multi_staff'
  | 'multi_location'
  | 'custom_domain'
  | 'api_access'
  | 'priority_support'
  | 'sla'
  | 'white_glove_onboarding'
  | 'platform_ai_key'    // Use platform's AI key (charges per-message)

export type ChannelKey =
  | 'whatsapp'
  | 'sms'
  | 'email'
  | 'voice'
  | 'instagram'
  | 'google_ads'
  | 'google_calendar'
  | 'razorpay'

export interface PlanFeatures {
  plan: PlanTier
  label: string
  tagline: string
  channels: ChannelKey[]           // Which channels the user can connect
  features: Feature[]              // Which features are available
  maxCustomers: number | null      // null = unlimited
  maxCampaignsPerMonth: number | null
  maxStaffSeats: number            // Multi-staff user limit
  maxLocations: number
  aiMessagesIncluded: number       // Per month
  aiMessageOveragePaise: number    // Per message after limit
  platformKeySurchargePaise: number // Monthly fee if using platform AI key
  dataRetentionDays: number
  hasPrioritySupport: boolean
  hasSLA: boolean
  hasWhiteGlove: boolean
  hasApiAccess: boolean
  hasMultiLocation: boolean
  monthlyPricePaise: number | null  // null = per-booking only
  perBookingPaise: number           // 0 for starter (already paying monthly)
}

export const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  // Trial = same as starter but with stricter limits + 14-day expiry handled elsewhere
  trial: {
    plan: 'trial',
    label: 'Trial',
    tagline: '14-day free trial, see everything MarketMitra can do',
    channels: ['whatsapp', 'google_calendar', 'razorpay'],
    features: [
      'whatsapp_inbox',
      'whatsapp_broadcasts',
      'whatsapp_automations',
      'reactivation_ai',
      'birthday_wishes',
      'review_requests',
    ],
    maxCustomers: 100,
    maxCampaignsPerMonth: 5,
    maxStaffSeats: 1,
    maxLocations: 1,
    aiMessagesIncluded: 100,
    aiMessageOveragePaise: 0,
    platformKeySurchargePaise: 0,
    dataRetentionDays: 14,
    hasPrioritySupport: false,
    hasSLA: false,
    hasWhiteGlove: false,
    hasApiAccess: false,
    hasMultiLocation: false,
    monthlyPricePaise: 0,
    perBookingPaise: 0,
  },

  starter: {
    plan: 'starter',
    label: 'Starter',
    tagline: 'For solo practitioners just getting started',
    channels: ['whatsapp', 'email', 'google_calendar', 'razorpay'],
    features: [
      'whatsapp_inbox',
      'whatsapp_broadcasts',
      'whatsapp_automations',
      'reactivation_ai',
      'birthday_wishes',
      'review_requests',
      'recurring_appointments',
    ],
    maxCustomers: 1000,
    maxCampaignsPerMonth: 20,
    maxStaffSeats: 1,
    maxLocations: 1,
    aiMessagesIncluded: 500,
    aiMessageOveragePaise: 200,        // ₹2 per message over limit
    platformKeySurchargePaise: 49900,  // ₹499/mo if using platform key
    dataRetentionDays: 90,
    hasPrioritySupport: false,
    hasSLA: false,
    hasWhiteGlove: false,
    hasApiAccess: false,
    hasMultiLocation: false,
    monthlyPricePaise: 300000,         // ₹3,000/month
    perBookingPaise: 0,                // Already paying monthly
  },

  enterprise: {
    plan: 'enterprise',
    label: 'Enterprise',
    tagline: 'For brands, franchises, agencies — multi-tenant + custom AI',
    channels: ['whatsapp', 'sms', 'email', 'voice', 'instagram', 'google_ads', 'google_calendar', 'razorpay'],
    features: [
      'whatsapp_inbox',
      'whatsapp_broadcasts',
      'whatsapp_automations',
      'voice_ai',
      'voice_ai_regional',
      'instagram',
      'google_ads',
      'reactivation_ai',
      'birthday_wishes',
      'festival_campaigns',
      'review_requests',
      'recurring_appointments',
      'no_show_prediction',
      'multi_staff',
      'multi_location',
      'priority_support',
      'sla',
      'white_glove_onboarding',
      'api_access',
      'custom_domain',
      'platform_ai_key',
    ],
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    maxStaffSeats: 9999,
    maxLocations: 9999,
    aiMessagesIncluded: 999999,            // Effectively unlimited
    aiMessageOveragePaise: 0,             // No overage on enterprise
    platformKeySurchargePaise: 0,        // Custom contracts
    dataRetentionDays: 3650,             // 10 years
    hasPrioritySupport: true,
    hasSLA: true,
    hasWhiteGlove: true,
    hasApiAccess: true,
    hasMultiLocation: true,
    monthlyPricePaise: null,
    perBookingPaise: 10000,              // ₹100/booking (50% off)
  },

  growth: {
    plan: 'growth',
    label: 'Growth',
    tagline: 'For growing clinics with steady customer flow',
    channels: ['whatsapp', 'sms', 'email', 'voice', 'instagram', 'google_ads', 'google_calendar', 'razorpay'],
    features: [
      'whatsapp_inbox',
      'whatsapp_broadcasts',
      'whatsapp_automations',
      'voice_ai',
      'instagram',
      'google_ads',
      'reactivation_ai',
      'birthday_wishes',
      'festival_campaigns',
      'review_requests',
      'recurring_appointments',
      'no_show_prediction',
    ],
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    maxStaffSeats: 5,
    maxLocations: 1,
    aiMessagesIncluded: 5000,
    aiMessageOveragePaise: 100,        // ₹1 per message
    platformKeySurchargePaise: 99900,  // ₹999/mo
    dataRetentionDays: 365,
    hasPrioritySupport: true,
    hasSLA: false,
    hasWhiteGlove: false,
    hasApiAccess: false,
    hasMultiLocation: false,
    monthlyPricePaise: null,           // Per-booking only
    perBookingPaise: 20000,            // ₹200/booking
  },

  scale: {
    plan: 'scale',
    label: 'Scale',
    tagline: 'For multi-location chains and high-volume businesses',
    channels: ['whatsapp', 'sms', 'email', 'voice', 'instagram', 'google_ads', 'google_calendar', 'razorpay'],
    features: [
      'whatsapp_inbox',
      'whatsapp_broadcasts',
      'whatsapp_automations',
      'voice_ai',
      'voice_ai_regional',
      'instagram',
      'google_ads',
      'reactivation_ai',
      'birthday_wishes',
      'festival_campaigns',
      'review_requests',
      'recurring_appointments',
      'no_show_prediction',
      'multi_staff',
      'multi_location',
      'priority_support',
      'sla',
      'white_glove_onboarding',
      'api_access',
      'custom_domain',
    ],
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    maxStaffSeats: 999,
    maxLocations: 999,
    aiMessagesIncluded: 25000,
    aiMessageOveragePaise: 50,         // ₹0.50 per message
    platformKeySurchargePaise: 199900, // ₹1,999/mo
    dataRetentionDays: 1825,           // 5 years
    hasPrioritySupport: true,
    hasSLA: true,
    hasWhiteGlove: true,
    hasApiAccess: true,
    hasMultiLocation: true,
    monthlyPricePaise: null,
    perBookingPaise: 15000,            // ₹150/booking (25% off)
  },

  suspended: {
    plan: 'suspended',
    label: 'Suspended',
    tagline: 'Account suspended — please update billing to restore access',
    channels: [],
    features: [],
    maxCustomers: 0,
    maxCampaignsPerMonth: 0,
    maxStaffSeats: 0,
    maxLocations: 0,
    aiMessagesIncluded: 0,
    aiMessageOveragePaise: 0,
    platformKeySurchargePaise: 0,
    dataRetentionDays: 30,
    hasPrioritySupport: false,
    hasSLA: false,
    hasWhiteGlove: false,
    hasApiAccess: false,
    hasMultiLocation: false,
    monthlyPricePaise: 0,
    perBookingPaise: 0,
  },
}

export function getPlanFeatures(plan: string): PlanFeatures {
  return PLAN_FEATURES[plan as PlanTier] || PLAN_FEATURES.starter
}

/**
 * Cached plan-features lookup. Plan table is static so we can
 * memoize aggressively (1h TTL). Used by the AI guard and the
 * feature gate middleware.
 */
export async function getPlanFeaturesCached(plan: string): Promise<PlanFeatures> {
  const { getOrSet } = await import('./cache')
  return getOrSet(
    `pf:${plan}`,
    async () => getPlanFeatures(plan),
    { ttl: 3600 }
  )
}

// Check if a specific feature is enabled for the business's plan
export function hasFeature(plan: string, feature: Feature): boolean {
  return getPlanFeatures(plan).features.includes(feature)
}

// Check if a specific channel can be connected
export function canConnectChannel(plan: string, channel: ChannelKey): boolean {
  return getPlanFeatures(plan).channels.includes(channel)
}

// Get human-readable plan limit message when blocked
export function getPlanBlockMessage(plan: string, feature: Feature): string {
  const current = getPlanFeatures(plan)
  const featureLabels: Record<Feature, string> = {
    whatsapp_inbox: 'WhatsApp AI inbox',
    whatsapp_broadcasts: 'WhatsApp broadcasts',
    whatsapp_automations: 'WhatsApp automations',
    voice_ai: 'Voice AI',
    instagram: 'Instagram',
    google_ads: 'Google Ads',
    google_calendar: 'Google Calendar',
    razorpay: 'Razorpay payments',
    reactivation_ai: 'AI reactivation',
    birthday_wishes: 'Birthday wishes',
    festival_campaigns: 'Festival campaigns',
    review_requests: 'Review requests',
    recurring_appointments: 'Recurring appointments',
    no_show_prediction: 'No-show prediction',
    voice_ai_regional: 'Regional voice AI',
    multi_staff: 'Multi-staff',
    multi_location: 'Multi-location',
    custom_domain: 'Custom domain',
    api_access: 'API access',
    priority_support: 'Priority support',
    sla: '4-hour SLA',
    white_glove_onboarding: 'White-glove onboarding',
    platform_ai_key: 'Platform AI key',
  }
  return `${featureLabels[feature] || feature} is not available on the ${current.label} plan. Upgrade to unlock.`
}
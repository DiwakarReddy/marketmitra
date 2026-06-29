// Subscription plan definitions
// Customer can self-serve upgrade/downgrade via Razorpay

export type PlanTier = 'trial' | 'starter' | 'growth' | 'scale' | 'enterprise' | 'suspended'

export interface PlanDefinition {
  id: PlanTier
  name: string
  tagline: string
  monthlyPaise: number | null  // null = custom / contact sales
  perBookingPaise: number
  maxCustomers: number | null   // null = unlimited
  maxCampaignsPerMonth: number | null
  features: string[]
  highlighted?: boolean
  ctaText: string
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For solo practitioners just getting started',
    monthlyPaise: 300000,        // ₹3,000
    perBookingPaise: 20000,      // ₹200
    maxCustomers: 1000,
    maxCampaignsPerMonth: 20,
    features: [
      'WhatsApp AI inbox (Hinglish)',
      'Reactivation broadcasts',
      'Daily summary via WhatsApp',
      'Up to 1,000 customers',
      '20 campaigns/month',
      'Email support',
    ],
    ctaText: 'Current plan',
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'For growing clinics with steady customer flow',
    monthlyPaise: null,          // per-booking only
    perBookingPaise: 20000,      // ₹200
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    features: [
      'Everything in Starter',
      'Voice AI for reactivation calls',
      'Instagram AI captions & DMs',
      'Google Ads automation',
      'Email + SMS campaigns',
      '5,000 AI messages / month',
      'Unlimited customers',
      'Unlimited campaigns',
      'Priority support',
      'Outcome-based pricing — only pay per booking',
    ],
    highlighted: true,
    ctaText: 'Most popular',
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For multi-location chains and high-volume businesses',
    monthlyPaise: null,
    perBookingPaise: 15000,      // ₹150 (25% discount)
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    features: [
      'Everything in Growth',
      '₹150 per booking (25% off)',
      'Multi-location support',
      '25,000 AI messages / month',
      'Dedicated success manager',
      'Custom WhatsApp templates',
      'API access',
      'White-glove onboarding',
      'SLA: 4-hour response',
    ],
    ctaText: 'Upgrade to Scale',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For brands, franchises, and agencies managing multiple businesses',
    monthlyPaise: null,           // custom contract
    perBookingPaise: 10000,      // ₹100 (50% off)
    maxCustomers: null,
    maxCampaignsPerMonth: null,
    features: [
      'Everything in Scale',
      '₹100 per booking (50% off)',
      'Unlimited AI messages',
      'Dedicated AI model fine-tuned on your business',
      'Multi-brand / multi-tenant dashboards',
      'SSO + role-based access (owner, manager, agent)',
      'Custom integrations + webhooks',
      'On-premise deployment option',
      '99.9% uptime SLA + dedicated CSM',
      'Compliance: SOC2 / HIPAA / GDPR-ready',
    ],
    ctaText: 'Contact sales',
  },
]

export function getPlan(id: string): PlanDefinition | null {
  return PLANS.find((p) => p.id === id) || null
}

// Feature comparison matrix for the pricing page
export const FEATURE_MATRIX = [
  {
    category: 'Channels',
    features: [
      { name: 'WhatsApp AI inbox', starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Reactivation broadcasts', starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Email campaigns (Resend / SES)', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'SMS campaigns (Twilio / MSG91 / Plivo)', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Voice AI calls (Twilio)', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Instagram captions & DMs', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Google Ads automation', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Custom channels (webhooks / API)', starter: false, growth: false, scale: true, enterprise: true },
    ],
  },
  {
    category: 'AI Capacity',
    features: [
      { name: 'AI messages / month', starter: '500', growth: '5,000', scale: '25,000', enterprise: 'Unlimited' },
      { name: 'Bring your own AI key (OpenAI / Gemini)', starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Custom fine-tuned model', starter: false, growth: false, scale: false, enterprise: true },
      { name: 'AI replies in 10 Indian languages', starter: true, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: 'Capacity',
    features: [
      { name: 'Customers', starter: '1,000', growth: 'Unlimited', scale: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Campaigns / month', starter: '20', growth: 'Unlimited', scale: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Team members', starter: '1', growth: '5', scale: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Locations', starter: '1', growth: '1', scale: 'Unlimited', enterprise: 'Unlimited' },
      { name: 'Multi-brand dashboards', starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
  {
    category: 'Compliance & Support',
    features: [
      { name: 'Email support', starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Priority support', starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Dedicated success manager', starter: false, growth: false, scale: true, enterprise: true },
      { name: 'SLA', starter: '48h', growth: '24h', scale: '4h', enterprise: '99.9% uptime' },
      { name: 'SOC2 / HIPAA / GDPR', starter: false, growth: false, scale: false, enterprise: true },
      { name: 'SSO + RBAC', starter: false, growth: false, scale: false, enterprise: true },
      { name: 'On-premise option', starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
]
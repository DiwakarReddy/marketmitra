// Subscription plan definitions
// Customer can self-serve upgrade/downgrade via Razorpay

export type PlanTier = 'trial' | 'starter' | 'growth' | 'scale' | 'suspended'

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
      'Instagram content generation',
      'Google Ads automation',
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
      'Dedicated success manager',
      'Custom WhatsApp templates',
      'API access',
      'White-glove onboarding',
      'SLA: 4-hour response',
    ],
    ctaText: 'Upgrade to Scale',
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
      { name: 'WhatsApp AI inbox', starter: true, growth: true, scale: true },
      { name: 'Reactivation broadcasts', starter: true, growth: true, scale: true },
      { name: 'Voice AI calls', starter: false, growth: true, scale: true },
      { name: 'Instagram content', starter: false, growth: true, scale: true },
      { name: 'Google Ads automation', starter: false, growth: true, scale: true },
      { name: 'Email automation', starter: false, growth: true, scale: true },
    ],
  },
  {
    category: 'Capacity',
    features: [
      { name: 'Customers', starter: '1,000', growth: 'Unlimited', scale: 'Unlimited' },
      { name: 'Campaigns / month', starter: '20', growth: 'Unlimited', scale: 'Unlimited' },
      { name: 'Team members', starter: '1', growth: '5', scale: 'Unlimited' },
      { name: 'Locations', starter: '1', growth: '1', scale: 'Unlimited' },
    ],
  },
  {
    category: 'Support',
    features: [
      { name: 'Email support', starter: true, growth: true, scale: true },
      { name: 'Priority support', starter: false, growth: true, scale: true },
      { name: 'Dedicated success manager', starter: false, growth: false, scale: true },
      { name: 'SLA', starter: '48h', growth: '24h', scale: '4h' },
    ],
  },
] as const
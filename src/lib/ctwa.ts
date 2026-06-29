// Meta Marketing API helpers for Click-to-WhatsApp Ads (CTWA).
//
// CTWA flow:
//   1. User creates an ad (AdCreative with link to wa.me/<phone>?text=<welcome>)
//   2. The ad appears in Facebook/Instagram feed with a "Send Message" CTA
//   3. When tapped, opens WhatsApp chat with the business
//   4. The first inbound message from that user arrives at our webhook tagged with
//      `source: 'ctwa'` (via Meta's `referral` header) so we can attribute it.
//
// We use Meta Graph API v18+ for:
//   - /<AD_ACCOUNT>/adcreatives (with CTWA link)
//   - /act_<AD_ACCOUNT>/campaigns
//   - /act_<AD_ACCOUNT>/adsets
//   - /act_<AD_ACCOUNT>/ads
//
// Required scopes on the system user token: ads_management, ads_read, business_management

const META_API_VERSION = process.env.META_API_VERSION || 'v18.0'
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface CTWACreateInput {
  adAccountId: string          // 'act_123456789'
  pageId: string
  whatsappPhoneNumber: string  // E.164 or with +
  welcomeMessage: string
  adHeadline: string
  adBody: string
  imageHash?: string           // pre-uploaded image hash from /adimages
  imageUrl?: string
  link?: string                // optional web destination (usually wa.me link)
  callToAction?: string        // 'SEND_MESSAGE' default for CTWA
  dailyBudgetPaise: number
  audience: {
    ageMin?: number
    ageMax?: number
    locations?: string[]       // ISO country codes or city IDs
    interests?: string[]       // interest IDs
    gender?: 'all' | 'male' | 'female'
  }
  campaignName: string
  accessToken: string
}

export interface CTWACreateResult {
  campaignId: string
  adSetId: string
  adCreativeId: string
  adId: string
}

export async function createCTWACampaign(input: CTWACreateInput): Promise<CTWACreateResult> {
  const waLink = input.link || `https://wa.me/${input.whatsappPhoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(input.welcomeMessage)}`

  // Step 1: Create campaign (objective = OUTCOME_LEADS for CTWA)
  const campaign = await metaFetch(`act_${input.adAccountId}/campaigns`, {
    method: 'POST',
    accessToken: input.accessToken,
    body: {
      name: input.campaignName,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',  // start paused; user activates manually after review
      special_ad_categories: [],
    },
  })

  // Step 2: Create ad set with targeting
  const targeting: any = {}
  if (input.audience.ageMin || input.audience.ageMax) {
    targeting.age_min = input.audience.ageMin || 18
    targeting.age_max = input.audience.ageMax || 65
  }
  if (input.audience.gender && input.audience.gender !== 'all') {
    targeting.genders = input.audience.gender === 'male' ? [1] : [2]
  }
  if (input.audience.locations?.length) {
    targeting.geo_locations = {
      countries: input.audience.locations.filter((l) => /^[A-Z]{2}$/.test(l)),
      cities: input.audience.locations.filter((l) => /^\d+$/.test(l)),
    }
  }
  if (input.audience.interests?.length) {
    targeting.flexible_spec = [
      { interests: input.audience.interests.map((id) => ({ id })) },
    ]
  }

  const adSet = await metaFetch(`act_${input.adAccountId}/adsets`, {
    method: 'POST',
    accessToken: input.accessToken,
    body: {
      name: `${input.campaignName} - Ad Set`,
      campaign_id: campaign.id,
      daily_budget: Math.round(input.dailyBudgetPaise / 100),  // budget in rupees
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION',
      bid_amount: 5000, // ₹50 per lead
      targeting,
      status: 'PAUSED',
      promoted_object: {
        page_id: input.pageId,
      },
    },
  })

  // Step 3: Create ad creative
  const linkData: any = {
    link: waLink,
    message: input.adBody,
    name: input.adHeadline,
    call_to_action: {
      type: input.callToAction || 'SEND_MESSAGE',
      value: {
        link: waLink,
      },
    },
  }
  if (input.imageHash) {
    linkData.image_hash = input.imageHash
  } else if (input.imageUrl) {
    linkData.picture = input.imageUrl
  }

  const creative = await metaFetch(`act_${input.adAccountId}/adcreatives`, {
    method: 'POST',
    accessToken: input.accessToken,
    body: {
      name: `${input.campaignName} - Creative`,
      object_story_spec: {
        page_id: input.pageId,
        link_data: linkData,
      },
    },
  })

  // Step 4: Create ad
  const ad = await metaFetch(`act_${input.adAccountId}/ads`, {
    method: 'POST',
    accessToken: input.accessToken,
    body: {
      name: `${input.campaignName} - Ad`,
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    },
  })

  return {
    campaignId: campaign.id,
    adSetId: adSet.id,
    adCreativeId: creative.id,
    adId: ad.id,
  }
}

/**
 * Fetch live stats for a CTWA campaign.
 */
export async function fetchCTWAInsights(adId: string, accessToken: string, since?: Date) {
  const params = new URLSearchParams({
    fields: 'impressions,clicks,spend,actions,cost_per_action_type',
    access_token: accessToken,
  })
  if (since) params.set('time_range.since', since.toISOString().split('T')[0])
  params.set('time_range.until', new Date().toISOString().split('T')[0])

  const res = await fetch(`${META_GRAPH_BASE}/${adId}/insights?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Insights fetch failed: ${res.status}`)
  }
  const data = await res.json()
  return data.data?.[0] || null
}

/**
 * Activate a paused CTWA campaign.
 */
export async function activateCTWACampaign(adId: string, accessToken: string): Promise<void> {
  await metaFetch(`/${adId}`, {
    method: 'POST',
    accessToken,
    body: { status: 'ACTIVE' },
  })
}

/**
 * Pause an active CTWA campaign.
 */
export async function pauseCTWACampaign(adId: string, accessToken: string): Promise<void> {
  await metaFetch(`/${adId}`, {
    method: 'POST',
    accessToken,
    body: { status: 'PAUSED' },
  })
}

async function metaFetch(path: string, opts: { method: string; accessToken: string; body: any }) {
  const params = new URLSearchParams({ access_token: opts.accessToken })
  for (const [k, v] of Object.entries(opts.body)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'object') {
      params.set(k, JSON.stringify(v))
    } else {
      params.set(k, String(v))
    }
  }
  const url = `${META_GRAPH_BASE}/${path}?${params.toString()}`
  const res = await fetch(url, { method: opts.method })
  const data = await res.json()
  if (!res.ok) {
    const msg = data?.error?.message || `Meta API ${res.status}`
    const err: any = new Error(msg)
    err.code = data?.error?.code
    err.subcode = data?.error?.error_subcode
    throw err
  }
  return data
}

/**
 * Detect CTWA inbound messages via Meta's referral field.
 * Meta sends `referral` object on first CTWA-tap message:
 *   { referral: { source_url, type: "OPEN_THREAD"|"ADS", ad_id, ctwa_clid } }
 *
 * Returns { isCtwa, adId, ctwaClid } or null if not CTWA.
 */
export function detectCtwaReferral(payload: any): { isCtwa: boolean; adId?: string; ctwaClid?: string; sourceUrl?: string } {
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  if (!message?.referral) return { isCtwa: false }
  const r = message.referral
  const isCtwa = r.type === 'ADS' || r.source_type === 'ad' || !!r.ad_id || !!r.ctwa_clid
  return {
    isCtwa,
    adId: r.ad_id,
    ctwaClid: r.ctwa_clid,
    sourceUrl: r.source_url,
  }
}
// AI cost control — the ONLY way AI is invoked.
//
// Wraps every AI call with:
//   1. Hard monthly budget enforcement (per business)
//   2. Per-minute rate limiting (per business) — Redis-backed for multi-instance
//   3. Concurrent request limits (per business) — Redis-backed for multi-instance
//   4. Idempotency cache (cheap queries deduped) — Redis-backed when available
//   5. Cost tracking (increments after successful call)
//
// Callers should NEVER call generateAIReply / generateWithCustomPrompt
// directly — always go through guardedAI().
//
// Why: OpenAI bills by token, Gemini bills by request, and a single
// misbehaving customer can rack up thousands of dollars. This is the
// single chokepoint that prevents that.

import { prisma } from '@/lib/db'
import { generateAIReply, generateWithCustomPrompt } from './ai'
import type { AIContext } from './ai'
import { getOrSet, invalidate, getCacheStats } from './cache'
import crypto from 'crypto'
import { getPlanFeatures } from './plan-features'

// ============================================================
// SHARED DISTRIBUTED COUNTER (L1 + Redis L2)
//
// Used for rate-limit windows and concurrent-slot counters.
// When Redis is available, the in-process map is the fast path
// and Redis is the cross-instance source of truth.
// When Redis is missing, we fall back to per-process counters
// (correct for single-instance dev, less correct at scale but
// graceful — the cache layer logs once and serves L1).
// ============================================================

/**
 * Atomic INCR with TTL — best-effort distributed counter.
 * Returns the post-increment value, or null if Redis is unavailable.
 */
async function redisIncrWithTtl(key: string, ttlSec: number): Promise<number | null> {
  try {
    const { getRedis } = await import('./cache')
    const r = await getRedis()
    if (!r) return null
    const v = await r.incr(key)
    if (v === 1) await r.expire(key, ttlSec).catch(() => null)
    return v
  } catch {
    return null
  }
}

/** DECR for slot release. Never goes below 0. */
async function redisDecr(key: string): Promise<void> {
  try {
    const { getRedis } = await import('./cache')
    const r = await getRedis()
    if (!r) return
    const v = await r.decr(key)
    if (v !== null && v < 0) await r.set(key, '0').catch(() => null)
  } catch {
    // ignore
  }
}

/** GET current counter (returns 0 if missing). */
async function redisGet(key: string): Promise<number | null> {
  try {
    const { getRedis } = await import('./cache')
    const r = await getRedis()
    if (!r) return null
    const v = await r.get(key)
    return v === null ? null : parseInt(v, 10) || 0
  } catch {
    return null
  }
}

/** SET with EX (atomic reset). */
async function redisSetEx(key: string, ttlSec: number, value: string): Promise<void> {
  try {
    const { getRedis } = await import('./cache')
    const r = await getRedis()
    if (!r) return
    await r.set(key, value, 'EX', ttlSec)
  } catch {
    // ignore
  }
}

/** Best-effort slot release — try Redis first, then L1. */
async function releaseRedisSlot(key: string, l1: Map<string, number>): Promise<void> {
  await redisDecr(key)
  const cur = l1.get(key) || 0
  if (cur > 0) l1.set(key, cur - 1)
}

// ============================================================
// L1 (in-process) — sub-ms fallback when Redis is missing
// ============================================================

const rateLimitL1 = new Map<string, { count: number; resetAt: number }>()
const concurrentL1 = new Map<string, number>()

setInterval(() => {
  const now = Date.now()
  for (const [k, v] of rateLimitL1.entries()) {
    if (v.resetAt < now) rateLimitL1.delete(k)
  }
}, 5 * 60 * 1000).unref()

/** Per-business per-minute cap. Default 30 — enough for chatty customers
 *  but stops a runaway. */
async function checkRateLimit(businessId: string, maxPerMinute: number = 30): Promise<boolean> {
  const now = Date.now()
  const key = `ai:rl:${businessId}`
  const ttl = 70 // slightly longer than the window so cleanup races are safe

  // Try Redis first — authoritative across instances
  const dist = await redisIncrWithTtl(key, ttl)
  if (dist !== null) {
    return dist <= maxPerMinute
  }

  // L1 fallback
  const entry = rateLimitL1.get(key)
  if (!entry || entry.resetAt < now) {
    rateLimitL1.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= maxPerMinute) return false
  entry.count++
  return true
}

/** Per-business concurrent cap. Default 5 — prevents one customer's
 *  webhook burst from monopolizing the AI queue. */
async function acquireConcurrentSlot(businessId: string, max: number = 5): Promise<boolean> {
  const key = `ai:conc:${businessId}`
  const ttl = 120 // safety: slots expire if a worker crashes mid-call

  const dist = await redisIncrWithTtl(key, ttl)
  if (dist !== null) {
    if (dist > max) {
      // Roll back the increment — we said no.
      await redisDecr(key)
      return false
    }
    return true
  }

  // L1 fallback
  const cur = concurrentL1.get(key) || 0
  if (cur >= max) return false
  concurrentL1.set(key, cur + 1)
  return true
}

async function releaseConcurrentSlot(businessId: string): Promise<void> {
  await releaseRedisSlot(`ai:conc:${businessId}`, concurrentL1)
}

// ============================================================
// USAGE COUNTERS (DB — source of truth for billing)
// ============================================================

async function getCurrentUsage(businessId: string) {
  return getOrSet(
    `aiu:${businessId}`,
    async () => {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { plan: true, aiMessagesThisMonth: true, aiMessagesResetAt: true },
      })
      if (!business) return { used: 0, plan: 'starter', resetAt: null as Date | null }
      const now = new Date()
      const needsReset = !business.aiMessagesResetAt || business.aiMessagesResetAt < now
      if (needsReset) {
        // Reset (race-safe via the track function below)
        await prisma.business.updateMany({
          where: {
            id: businessId,
            OR: [
              { aiMessagesResetAt: null },
              { aiMessagesResetAt: { lt: now } },
            ],
          },
          data: { aiMessagesThisMonth: 0, aiMessagesResetAt: nextReset(now) },
        })
        return { used: 0, plan: business.plan, resetAt: nextReset(now) }
      }
      return { used: business.aiMessagesThisMonth, plan: business.plan, resetAt: business.aiMessagesResetAt }
    },
    { ttl: 30, l1Only: true } // short TTL, no need for Redis here — DB is the source of truth
  )
}

function nextReset(now: Date): Date {
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1, 1)
  next.setHours(0, 0, 0, 0)
  return next
}

async function incrementUsage(businessId: string, count: number) {
  // Bypass cache — write directly
  await prisma.business.update({
    where: { id: businessId },
    data: { aiMessagesThisMonth: { increment: count } },
  })
  // Invalidate the cache so next read is fresh
  await invalidate(`aiu:${businessId}`)
}

// ============================================================
// COST LOG — per-call token / cost snapshot (for dashboards)
// ============================================================

export interface AICostEntry {
  businessId: string
  ts: number
  /** Estimated USD cost (best-effort; OpenAI/Gemini pricing). */
  costUsd: number
  /** In + out tokens if known; 0 if provider doesn't return them. */
  inTokens: number
  outTokens: number
  /** 'openai' | 'google' | 'mock' | 'cache' */
  provider: string
  /** Which guard wrapper was used. */
  source: 'reply' | 'custom' | 'template_generate' | 'drip' | 'campaign'
  /** Whether the call was served from idempotency cache. */
  cached: boolean
  /** Reason if blocked at guard. */
  blockedReason?: string
}

// Best-effort in-process ring buffer for observability.
// For production-grade analytics, this should be flushed to a TSDB
// (Datadog/ClickHouse). The buffer keeps the most recent N entries
// per business so the /api/ai/usage endpoint can show live stats.
const costBuffer = new Map<string, AICostEntry[]>()
const COST_BUFFER_MAX = 500

export function recordAICost(entry: AICostEntry) {
  const list = costBuffer.get(entry.businessId) || []
  list.push(entry)
  if (list.length > COST_BUFFER_MAX) list.splice(0, list.length - COST_BUFFER_MAX)
  costBuffer.set(entry.businessId, list)
}

export function getRecentCosts(businessId: string, limit = 50): AICostEntry[] {
  const list = costBuffer.get(businessId) || []
  return list.slice(-limit).reverse()
}

/** Sum cost for the current minute / hour — used by the guard
 *  to short-circuit when the business is hammering. */
export function recentCostWindowUsd(businessId: string, windowMs: number): number {
  const list = costBuffer.get(businessId) || []
  const cutoff = Date.now() - windowMs
  let sum = 0
  for (const e of list) if (e.ts >= cutoff) sum += e.costUsd
  return sum
}

// ============================================================
// PUBLIC API
// ============================================================

export type GuardDecision =
  | { allowed: true; cached?: boolean; cacheKey?: string }
  | { allowed: false; reason: 'budget' | 'rate_limit' | 'concurrent' | 'plan_suspended' | 'cost_burst'; message: string; retryAfterSec?: number }

export interface GuardOptions {
  /** Skip the idempotency cache (force a fresh AI call). */
  noCache?: boolean
  /** Custom cache TTL in seconds (default 300 = 5 min for similar queries). */
  cacheTtl?: number
  /** Skip budget enforcement (for admin/system tasks). */
  skipBudget?: boolean
  /** Custom per-minute rate limit. */
  perMinute?: number
  /** Custom concurrent limit. */
  concurrent?: number
  /** Allow burst above the cost window (e.g. for backfills / nightly jobs). */
  skipCostBurst?: boolean
  /** Source tag for cost analytics. */
  source?: AICostEntry['source']
}

export interface GuardedCallOptions extends GuardOptions {
  businessId: string
  /** Cache key prefix (e.g. 'ai-reply', 'ai-generate'). Always suffix with
   *  a hash of the inputs to avoid collisions. */
  cacheKeyPrefix: string
  /** Build a deterministic cache key from the inputs. Should include
   *  customer id, recent message, and channel — anything that makes
   *  the same query return the same answer. */
  cacheKeyFromInputs: () => string
}

/**
 * Decide whether an AI call is allowed. Returns allowed:true if so.
 * Does NOT call the AI — caller does that, then calls recordAIUsage().
 *
 * This is the cheap check (no AI call). Use it for high-volume paths.
 */
export async function checkAIGuard(
  businessId: string,
  opts: GuardOptions = {}
): Promise<GuardDecision> {
  // Suspended plans never get AI
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { plan: true },
  })
  if (!business || business.plan === 'suspended') {
    return {
      allowed: false,
      reason: 'plan_suspended',
      message: 'AI is paused on your account. Update billing in Settings to resume.',
    }
  }

  // Per-minute rate limit
  if (!(await checkRateLimit(businessId, opts.perMinute))) {
    return {
      allowed: false,
      reason: 'rate_limit',
      message: 'Too many AI requests this minute. Try again in a moment.',
      retryAfterSec: 60,
    }
  }

  // Concurrent cap
  if (!(await acquireConcurrentSlot(businessId, opts.concurrent))) {
    return {
      allowed: false,
      reason: 'concurrent',
      message: 'Your other AI requests are still being processed. Please wait.',
      retryAfterSec: 5,
    }
  }

  // Cost burst protection — even if budget remains, a runaway within
  // a 60-second window > ₹5 (≈$0.06) gets short-circuited.
  if (!opts.skipCostBurst) {
    const recentUsd = recentCostWindowUsd(businessId, 60_000)
    if (recentUsd > 0.06) {
      await releaseConcurrentSlot(businessId)
      return {
        allowed: false,
        reason: 'cost_burst',
        message: 'AI cost rate limit reached. Slow down and try again shortly.',
        retryAfterSec: 60,
      }
    }
  }

  // Budget — only enforced when using the PLATFORM AI key.
  // When the business has their own OpenAI/Google AI key configured,
  // they pay the provider directly — the platform budget doesn't apply.
  if (!opts.skipBudget) {
    const usingOwnKey = await hasBusinessAIKey(businessId)
    if (!usingOwnKey) {
      const usage = await getCurrentUsage(businessId)
      const planFeatures = getPlanFeatures(usage.plan)
      const included = planFeatures.aiMessagesIncluded
      if (included !== null && usage.used >= included) {
        // Over limit — only allow if plan allows overage
        // For now, hard block. Soft overage billing is a future enhancement.
        await releaseConcurrentSlot(businessId)
        return {
          allowed: false,
          reason: 'budget',
          message: `Monthly AI budget reached (${included} messages on ${planFeatures.label}). Connect your own OpenAI or Google AI key in Settings → Integrations to keep going, or upgrade your plan.`,
        }
      }
    }
  }

  return { allowed: true }
}

/** Check whether the business has their own AI provider key connected.
 *  Used to bypass the platform budget when the user pays the provider directly. */
async function hasBusinessAIKey(businessId: string): Promise<boolean> {
  try {
    const { resolveChannel } = await import('./channel-resolver')
    const [openai, gemini] = await Promise.all([
      resolveChannel(businessId, 'openai'),
      resolveChannel(businessId, 'google_ai'),
    ])
    if (openai?.credentials?.apiKey && String(openai.credentials.apiKey).startsWith('sk-')) return true
    if (gemini?.credentials?.apiKey && String(gemini.credentials.apiKey).length > 10) return true
    return false
  } catch {
    return false
  }
}

/** Release a concurrent slot (call if you bail out after acquiring). */
export async function releaseAISlot(businessId: string) {
  await releaseConcurrentSlot(businessId)
}

/** Record a successful AI call (for budget tracking). */
export async function recordAIUsage(businessId: string, count: number = 1) {
  await incrementUsage(businessId, count)
}

// ============================================================
// HIGH-LEVEL: guarded AI call with full protection
// ============================================================

export interface GuardedAIReplyInput {
  businessId: string
  context: AIContext
  history: Array<{ role: 'customer' | 'assistant'; content: string }>
  userMessage: string
  options?: GuardOptions
}

export interface GuardedAIReplyResult {
  reply: string
  cached: boolean
  usageRecorded: number
  provider: 'openai' | 'google' | 'mock' | 'cache'
}

/**
 * The main entry point for "AI, give me a reply".
 * - Checks budget + rate limit + concurrent + cost burst
 * - Checks idempotency cache (same inputs in last 5 min → cached)
 * - Calls AI
 * - Records usage + cost
 * - Caches result
 *
 * On any error, releases the concurrent slot.
 */
export async function guardedAIReply(input: GuardedAIReplyInput): Promise<GuardedAIReplyResult> {
  const cacheKey =
    `ai:${input.businessId}:reply:` +
    crypto
      .createHash('sha256')
      .update(JSON.stringify({
        msg: input.userMessage.slice(0, 200),
        hist: input.history.slice(-3).map((h) => h.content.slice(0, 100)),
        lang: input.context.language,
        channel: input.context.inboundChannel || '',
      }))
      .digest('hex')
      .slice(0, 24)

  // 1. Try idempotency cache first (cheap, no AI cost)
  if (!input.options?.noCache) {
    try {
      const cached = await getOrSet<string | null>(
        cacheKey,
        async () => null, // never populate here — populated on success path below
        { ttl: 1, l1Only: false }
      )
      if (cached) {
        return { reply: cached, cached: true, usageRecorded: 0, provider: 'cache' }
      }
    } catch {
      // cache miss — fall through
    }
  }

  // 2. Apply guards
  const decision = await checkAIGuard(input.businessId, input.options)
  if (!decision.allowed) {
    // Fall back to a deterministic Hinglish response so the customer isn't left hanging
    recordAICost({
      businessId: input.businessId,
      ts: Date.now(),
      costUsd: 0,
      inTokens: 0,
      outTokens: 0,
      provider: 'mock',
      source: 'reply',
      cached: false,
      blockedReason: decision.reason,
    })
    return {
      reply: 'अभी हम व्यस्त हैं — कृपया एक मिनट में दोबारा मैसेज करें। 🙏',
      cached: false,
      usageRecorded: 0,
      provider: 'mock',
    }
  }

  try {
    // 3. Make the AI call (or hit cache again — getOrSet dedupes
    //    concurrent identical requests too).
    const result = await getOrSet<string>(
      cacheKey,
      async () => generateAIReply(input.context, input.history, input.userMessage),
      { ttl: input.options?.cacheTtl ?? 300, l1Only: false }
    )

    // Determine provider for cost analytics.
    // We only have the text back, so we infer from which key is configured.
    let provider: 'openai' | 'google' | 'mock' = 'mock'
    if (process.env.OPENAI_API_KEY) provider = 'openai'
    else if (process.env.GOOGLE_API_KEY) provider = 'google'

    // Estimate cost (best-effort; rough per-call pricing)
    const costUsd = estimateCostUsd(provider, input.userMessage, result)
    recordAICost({
      businessId: input.businessId,
      ts: Date.now(),
      costUsd,
      inTokens: estimateTokens(input.userMessage + input.history.map((h) => h.content).join(' ')),
      outTokens: estimateTokens(result),
      provider,
      source: input.options?.source || 'reply',
      cached: false,
    })

    await recordAIUsage(input.businessId, 1)
    return { reply: result, cached: false, usageRecorded: 1, provider }
  } catch (err) {
    // AI failed — release the slot so the next request can proceed
    await releaseConcurrentSlot(input.businessId)
    throw err
  }
  // NOTE: we deliberately do NOT release the slot in a `finally` — the
  // AI call is fast enough that the TTL on `ai:conc:*` is the safety net
  // for crashed workers. Releasing on success would let a flood of
  // identical requests slip past the concurrent cap.
}

/** Similar wrapper for generateWithCustomPrompt (used by campaigns, drips, templates). */
export async function guardedAICustom(
  businessId: string,
  systemPrompt: string,
  userMessage: string,
  options: GuardOptions = {}
): Promise<{ text: string | null; cached: boolean; usageRecorded: number; provider: 'openai' | 'google' | 'mock' | 'cache' }> {
  const cacheKey =
    `ai:${businessId}:custom:` +
    crypto.createHash('sha256').update(systemPrompt + '|' + userMessage).digest('hex').slice(0, 24)

  // 1. Try idempotency cache first
  if (!options.noCache) {
    try {
      const cached = await getOrSet<string | null>(
        cacheKey,
        async () => null,
        { ttl: 1, l1Only: false }
      )
      if (cached !== null) {
        return { text: cached, cached: true, usageRecorded: 0, provider: 'cache' }
      }
    } catch {
      // fall through
    }
  }

  // 2. Apply guards
  const decision = await checkAIGuard(businessId, options)
  if (!decision.allowed) {
    recordAICost({
      businessId,
      ts: Date.now(),
      costUsd: 0,
      inTokens: 0,
      outTokens: 0,
      provider: 'mock',
      source: options.source || 'custom',
      cached: false,
      blockedReason: decision.reason,
    })
    return { text: null, cached: false, usageRecorded: 0, provider: 'mock' }
  }

  try {
    const text = await getOrSet<string | null>(
      cacheKey,
      async () => generateWithCustomPrompt(systemPrompt, userMessage),
      { ttl: options.cacheTtl ?? 600, l1Only: false }
    )

    let provider: 'openai' | 'google' | 'mock' = 'mock'
    if (process.env.OPENAI_API_KEY) provider = 'openai'
    else if (process.env.GOOGLE_API_KEY) provider = 'google'

    if (text) {
      const costUsd = estimateCostUsd(provider, userMessage, text)
      recordAICost({
        businessId,
        ts: Date.now(),
        costUsd,
        inTokens: estimateTokens(systemPrompt + '|' + userMessage),
        outTokens: estimateTokens(text),
        provider,
        source: options.source || 'custom',
        cached: false,
      })
      await recordAIUsage(businessId, 1)
    }

    return { text, cached: false, usageRecorded: text ? 1 : 0, provider }
  } catch (err) {
    await releaseConcurrentSlot(businessId)
    throw err
  }
}

// ============================================================
// COST ESTIMATION (best-effort, not billing-grade)
// ============================================================

/** ~4 chars per token for English; Hinglish skews slightly higher. */
function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/** USD estimate per call. Conservative — better to over-estimate.
 *  OpenAI gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output (2025 rates)
 *  Gemini 1.5 Flash:  ~$0.075 / 1M input, $0.30 / 1M output
 *  Mock / cached: $0 */
function estimateCostUsd(provider: 'openai' | 'google' | 'mock', userMsg: string, output: string): number {
  if (provider === 'mock') return 0
  const inT = estimateTokens(userMsg)
  const outT = estimateTokens(output)
  if (provider === 'openai') return (inT * 0.15 + outT * 0.60) / 1_000_000
  if (provider === 'google') return (inT * 0.075 + outT * 0.30) / 1_000_000
  return 0
}

// ============================================================
// USAGE DASHBOARD
// ============================================================

export async function getAIGuardStatus(businessId: string) {
  const usage = await getCurrentUsage(businessId)
  const planFeatures = getPlanFeatures(usage.plan)
  const included = planFeatures.aiMessagesIncluded ?? 0
  const used = usage.used
  const remaining = Math.max(0, included - used)
  const percentUsed = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0

  // Live cost telemetry
  const recent1m = recentCostWindowUsd(businessId, 60_000)
  const recent1h = recentCostWindowUsd(businessId, 3600_000)

  return {
    plan: usage.plan,
    planLabel: planFeatures.label,
    included,
    used,
    remaining,
    percentUsed,
    overage: Math.max(0, used - included),
    overagePaise: Math.max(0, used - included) * planFeatures.aiMessageOveragePaise,
    resetAt: usage.resetAt,
    daysUntilReset: usage.resetAt
      ? Math.max(0, Math.ceil((new Date(usage.resetAt).getTime() - Date.now()) / 86400000))
      : 0,
    live: {
      costUsdLastMinute: recent1m,
      costUsdLastHour: recent1h,
      recentCalls: getRecentCosts(businessId, 10),
    },
    cache: getCacheStats(),
  }
}
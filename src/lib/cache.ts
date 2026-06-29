// Cache layer — abstracts over an in-process LRU + optional Redis.
//
// Why this exists: hot paths (channel-resolver, plan lookups, AI prompt
// enrichment) get called on every request. Caching them in-process
// gives O(1) reads with zero network. When you scale to multiple
// instances, swap to Redis without changing call sites.
//
// We support a "two-tier" pattern: in-process L1 (sub-ms) + optional
// Redis L2 (~1ms). Read goes L1 → L2 → origin; write invalidates both.
//
// Falls back gracefully:
//   - Redis not configured → L1 only (the default for dev / single-instance)
//   - Redis unreachable  → log once, serve from L1
//
// All cache misses auto-populate. No application code needs to know
// about the cache — call `getOrSet(key, ttl, fetcher)`.

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

// ============================================================
// L1: In-memory LRU (per-process, sub-ms)
// ============================================================

class LRU<K, V> {
  private map = new Map<K, V>()
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    // Move to end (most-recently used)
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    // Evict LRU if over capacity
    if (this.map.size > this.maxSize) {
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined) this.map.delete(firstKey)
    }
  }

  delete(key: K) {
    this.map.delete(key)
  }

  clear() {
    this.map.clear()
  }

  size() {
    return this.map.size
  }

  keys(): K[] {
    return [...this.map.keys()]
  }
}

const l1 = new LRU<string, CacheEntry<any>>(5000)

// ============================================================
// L2: Optional Redis (multi-instance)
// Init-once on first use (not on every getOrSet call).
// ============================================================

let redisClient: any = null
let redisLoadAttempted = false
let redisLoadFailed = false
let redisInitPromise: Promise<any> | null = null

/**
 * Initialize Redis once. Safe to call concurrently — only the first
 * call connects; others wait on the same promise.
 *
 * Returns null if REDIS_URL is unset or the connection fails.
 */
async function tryLoadRedis(): Promise<any> {
  if (redisClient) return redisClient
  if (redisLoadFailed) return null
  if (redisInitPromise) return redisInitPromise

  redisInitPromise = (async () => {
    const url = process.env.REDIS_URL
    if (!url) {
      redisLoadFailed = true
      return null
    }
    try {
      // Optional dep — if it's not installed, skip silently.
      // The dev story is: install `ioredis` and set REDIS_URL to enable.
      // Otherwise we serve from L1 only, which is correct for dev.
      // We use require so the build doesn't break when ioredis is missing.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis')
      redisClient = new Redis(url, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
        // Don't crash on transient disconnects
        reconnectOnError: () => false,
      })
      redisClient.on('error', () => { /* swallow — we fall back to L1 */ })
      try {
        await redisClient.connect()
      } catch {
        redisClient = null
        redisLoadFailed = true
      }
      redisLoadAttempted = true
      return redisClient
    } catch {
      redisClient = null
      redisLoadFailed = true
      redisLoadAttempted = true
      return null
    } finally {
      redisInitPromise = null
    }
  })()

  return redisInitPromise
}

/** Public accessor — used by ai-guard for distributed counters. */
export async function getRedis(): Promise<any | null> {
  return await tryLoadRedis()
}

/** For tests / hot-reload. */
export function resetRedisState() {
  try { redisClient?.disconnect?.() } catch {}
  redisClient = null
  redisLoadAttempted = false
  redisLoadFailed = false
  redisInitPromise = null
}

// ============================================================
// STATS — observability
// ============================================================

const stats = {
  l1Hits: 0,
  l1Misses: 0,
  l2Hits: 0,
  l2Misses: 0,
  originFetches: 0,
  redisErrors: 0,
  redisErrorsLogged: false,
}

export function getCacheStats() {
  const totalL1 = stats.l1Hits + stats.l1Misses
  const totalL2 = stats.l2Hits + stats.l2Misses
  return {
    l1Size: l1.size(),
    l1MaxSize: 5000,
    l2Enabled: !!redisClient && !redisLoadFailed,
    l2Connected: redisClient?.status === 'ready',
    hits: {
      l1: stats.l1Hits,
      l2: stats.l2Hits,
      total: stats.l1Hits + stats.l2Hits,
    },
    misses: {
      l1: stats.l1Misses,
      l2: stats.l2Misses,
      total: stats.l1Misses + stats.l2Misses,
    },
    hitRate: totalL1 + totalL2 > 0
      ? Math.round(((stats.l1Hits + stats.l2Hits) / (totalL1 + totalL2)) * 1000) / 10
      : 0,
    originFetches: stats.originFetches,
    redisErrors: stats.redisErrors,
  }
}

function noteRedisError() {
  stats.redisErrors++
  if (!stats.redisErrorsLogged) {
    stats.redisErrorsLogged = true
    console.warn('[cache] Redis error — falling back to L1. Future errors silenced.')
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export interface CacheOptions {
  /** TTL in seconds. Default 60. */
  ttl?: number
  /** Skip L2 (Redis) — useful for per-request data. */
  l1Only?: boolean
  /** Stale-while-revalidate: if a request fails, return stale data. */
  swr?: boolean
  /** Skip populating L2 even if it's up — for high-write / low-read patterns. */
  skipL2Write?: boolean
}

/**
 * Get a value from cache or compute it.
 * Always serves from cache when fresh; on miss, calls fetcher and
 * populates the cache. Errors from fetcher propagate to the caller.
 */
export async function getOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions = {}
): Promise<T> {
  const ttl = (opts.ttl ?? 60) * 1000
  const now = Date.now()

  // 1. L1 hit
  const l1Entry = l1.get(key)
  if (l1Entry && l1Entry.expiresAt > now) {
    stats.l1Hits++
    return l1Entry.value
  }
  stats.l1Misses++

  // 2. L2 hit (if Redis configured)
  if (!opts.l1Only) {
    const r = await tryLoadRedis()
    if (r && !redisLoadFailed) {
      try {
        const raw = await r.get(key)
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry<T>
          if (parsed.expiresAt > now) {
            // Promote to L1
            l1.set(key, parsed)
            stats.l2Hits++
            return parsed.value
          }
        }
        stats.l2Misses++
      } catch {
        noteRedisError()
        // Redis blip — fall through to fetcher
      }
    }
  }

  // 3. Miss — fetch
  stats.originFetches++
  const value = await fetcher()
  const entry: CacheEntry<T> = { value, expiresAt: now + ttl }
  l1.set(key, entry)

  if (!opts.l1Only && !opts.skipL2Write) {
    const r = await tryLoadRedis()
    if (r && !redisLoadFailed) {
      try {
        await r.set(key, JSON.stringify(entry), 'EX', opts.ttl ?? 60)
      } catch {
        noteRedisError()
      }
    }
  }
  return value
}

/**
 * Raw GET — returns the cached value or null. No fetcher.
 * Used by webhooks to do cheap idempotency lookups without
 * triggering a fetch path.
 */
export async function get<T = unknown>(key: string, opts: { l1Only?: boolean } = {}): Promise<T | null> {
  const now = Date.now()
  const e = l1.get(key)
  if (e && e.expiresAt > now) {
    stats.l1Hits++
    return e.value as T
  }
  if (!opts.l1Only) {
    const r = await tryLoadRedis()
    if (r && !redisLoadFailed) {
      try {
        const raw = await r.get(key)
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry<T>
          if (parsed.expiresAt > now) {
            l1.set(key, parsed)
            stats.l2Hits++
            return parsed.value as T
          }
        }
      } catch {
        noteRedisError()
      }
    }
  }
  return null
}

/**
 * SET without a fetcher — useful for priming the cache
 * (e.g. webhook dedupe: mark message id as seen before doing work).
 */
export async function set<T>(key: string, value: T, opts: { ttl?: number; l1Only?: boolean } = {}): Promise<void> {
  const ttlMs = (opts.ttl ?? 60) * 1000
  const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs }
  l1.set(key, entry)
  if (!opts.l1Only) {
    const r = await tryLoadRedis()
    if (r && !redisLoadFailed) {
      try {
        await r.set(key, JSON.stringify(entry), 'EX', opts.ttl ?? 60)
      } catch {
        noteRedisError()
      }
    }
  }
}

/** Manually invalidate a key (both tiers). */
export async function invalidate(key: string): Promise<void> {
  l1.delete(key)
  const r = await tryLoadRedis()
  if (r) {
    try { await r.del(key) } catch { noteRedisError() }
  }
}

/** Invalidate every key that starts with `prefix` (L1 + L2). */
export async function invalidatePrefix(prefix: string): Promise<void> {
  // L1 — exact iteration over keys
  for (const k of l1.keys()) {
    if (typeof k === 'string' && k.startsWith(prefix)) l1.delete(k)
  }
  // L2 — SCAN + DEL
  const r = await tryLoadRedis()
  if (r) {
    try {
      const stream = r.scanStream({ match: `${prefix}*`, count: 200 })
      for await (const keys of stream) {
        if (keys.length) await r.del(...(keys as string[]))
      }
    } catch {
      noteRedisError()
    }
  }
}

/** Invalidate everything for a business. Used when settings change. */
export async function invalidateBusiness(businessId: string): Promise<void> {
  await invalidatePrefix(`biz:${businessId}:`)
  await invalidatePrefix(`ch:${businessId}:`)
  await invalidatePrefix(`tpl:${businessId}:`)
  await invalidatePrefix(`pf:`) // plan features change rarely — drop cached
  await invalidate(`aiu:${businessId}`)
}

/** Drop the whole cache. Used by tests / admin "reset" actions. */
export async function clearAll(): Promise<void> {
  l1.clear()
  const r = await tryLoadRedis()
  if (r) {
    try {
      await r.flushdb()
    } catch {
      noteRedisError()
    }
  }
}

// ============================================================
// PRE-BUILT KEY BUILDERS
// ============================================================

export const cacheKeys = {
  channel: (businessId: string, channel: string) => `ch:${businessId}:${channel}`,
  plan: (planId: string) => `plan:${planId}`,
  planFeatures: (planId: string) => `pf:${planId}`,
  business: (businessId: string) => `biz:${businessId}:profile`,
  aiUsage: (businessId: string) => `aiu:${businessId}`,
  template: (businessId: string, templateId: string) => `tpl:${businessId}:${templateId}`,
  /** Idempotency marker for a webhook event (cross-instance safe). */
  webhookSeen: (provider: string, businessId: string, messageId: string) =>
    `seen:${provider}:${businessId}:${messageId}`,
  /** AI idempotency key — different from rate-limit prefix. */
  aiIdemp: (businessId: string, kind: 'reply' | 'custom', hash: string) =>
    `aiidem:${businessId}:${kind}:${hash}`,
}
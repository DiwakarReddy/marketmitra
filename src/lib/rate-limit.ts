// In-memory rate limiter
// For production with multiple instances, swap to Redis (Upstash, etc.)
// Pattern: sliding window with key per (route, identifier)

interface RateLimitConfig {
  windowMs: number
  max: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSec: number
}

const store = new Map<string, { count: number; resetAt: number }>()

// Cleanup expired entries every 5 min
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of store.entries()) {
    if (val.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000).unref()

export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs
    store.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt,
      retryAfterSec: 0,
    }
  }

  if (entry.count >= config.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    }
  }

  entry.count++
  store.set(key, entry)
  return {
    allowed: true,
    remaining: config.max - entry.count,
    resetAt: entry.resetAt,
    retryAfterSec: 0,
  }
}

// Predefined configs
export const RATE_LIMITS = {
  // Sensitive operations: very strict
  channelConnect: { windowMs: 5 * 60 * 1000, max: 5 },       // 5 attempts per 5 min
  channelDelete:  { windowMs: 60 * 1000, max: 3 },           // 3 deletes per minute
  channelTest:    { windowMs: 60 * 1000, max: 10 },          // 10 tests per minute
  channelList:    { windowMs: 60 * 1000, max: 30 },          // 30 lists per minute
  // General
  auth:           { windowMs: 15 * 60 * 1000, max: 10 },     // 10 auth attempts per 15 min
  api:            { windowMs: 60 * 1000, max: 60 },          // 60 req/min per user
  // Per-tenant
  sendMessage:    { windowMs: 60 * 1000, max: 100 },         // 100 msgs/min per business
  login:          { windowMs: 15 * 60 * 1000, max: 5 },     // 5 login attempts per 15 min
}

// Helper to apply in an API route
export function applyRateLimit(
  req: Request,
  identifier: string,
  limitName: keyof typeof RATE_LIMITS
): RateLimitResult | null {
  const config = RATE_LIMITS[limitName]
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const key = `${limitName}:${identifier}:${ip}`
  return checkRateLimit(key, config)
}

// Standard 429 response
export function rateLimitResponse(result: RateLimitResult) {
  return new Response(
    JSON.stringify({
      error: 'Too many requests',
      retryAfter: result.retryAfterSec,
      limit: 'Rate limit exceeded. Try again later.',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': result.retryAfterSec.toString(),
        'X-RateLimit-Reset': result.resetAt.toString(),
      },
    }
  )
}
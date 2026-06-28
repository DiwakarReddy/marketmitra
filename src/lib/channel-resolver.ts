// Resolves credentials for a business × channel
// Used by all integration libs (WhatsApp, Twilio, etc.) instead of env vars
// Also tracks lastUsedAt for visibility in admin dashboard

import { prisma } from '@/lib/db'
import { decryptJSON } from './kms'

export interface ResolvedChannel {
  config: Record<string, any>
  credentials: Record<string, any>
  provider?: string
}

const cache = new Map<string, { data: ResolvedChannel; expires: number }>()
const CACHE_TTL = 60_000 // 1 minute

// Last-used tracking with debounce (don't write on every call)
const lastUsedQueue = new Map<string, number>()
const LAST_USED_FLUSH_INTERVAL = 30_000 // 30 sec

setInterval(() => {
  if (lastUsedQueue.size === 0) return
  const updates = Array.from(lastUsedQueue.entries()).map(([key, ts]) => {
    const [businessId, channel] = key.split(':')
    return prisma.channelConfig.updateMany({
      where: { businessId, channel },
      data: { lastUsedAt: new Date(ts) },
    }).catch(() => null)
  })
  Promise.all(updates).then(() => lastUsedQueue.clear())
}, LAST_USED_FLUSH_INTERVAL).unref()

export async function resolveChannel(businessId: string, channel: string): Promise<ResolvedChannel | null> {
  const cacheKey = `${businessId}:${channel}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) {
    // Still track usage even from cache
    lastUsedQueue.set(cacheKey, Date.now())
    return cached.data
  }

  const cfg = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel } },
  })

  if (!cfg || !cfg.isActive) {
    cache.set(cacheKey, { data: { config: {}, credentials: {} }, expires: Date.now() + CACHE_TTL })
    return null
  }

  let config: Record<string, any> = {}
  let credentials: Record<string, any> = {}

  if (cfg.config) {
    try { config = JSON.parse(cfg.config) } catch {}
  }
  if (cfg.credentials) {
    try { credentials = await decryptJSON<Record<string, any>>(cfg.credentials, businessId) } catch {}
  }

  const data: ResolvedChannel = { config, credentials, provider: cfg.provider || undefined }

  cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL })
  lastUsedQueue.set(cacheKey, Date.now())
  return data
}

export function clearChannelCache(businessId?: string, channel?: string) {
  if (!businessId) {
    cache.clear()
    return
  }
  const key = `${businessId}:${channel}`
  cache.delete(key)
}
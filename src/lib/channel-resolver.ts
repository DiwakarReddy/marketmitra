// Resolves credentials for a business × channel
// Used by all integration libs (WhatsApp, Twilio, etc.) instead of env vars
// Also tracks lastUsedAt for visibility in admin dashboard

import { prisma } from '@/lib/db'
import { decryptJSON } from './kms'
import { getOrSet, cacheKeys, invalidate, invalidatePrefix } from './cache'

export interface ResolvedChannel {
  config: Record<string, any>
  credentials: Record<string, any>
  provider?: string
}

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

/**
 * Resolve credentials for a (business, channel) pair.
 *
 * Caching strategy:
 *   - 60s in-process + Redis cache (config + creds together) — channel
 *     credentials rarely rotate, and rotating them is cheap (call clearChannelCache).
 *   - lastUsedAt is debounced to avoid hot writes.
 */
export async function resolveChannel(businessId: string, channel: string): Promise<ResolvedChannel | null> {
  const cacheKey = cacheKeys.channel(businessId, channel)
  const lastUsedKey = `${businessId}:${channel}`

  const data = await getOrSet<ResolvedChannel | null>(
    cacheKey,
    async () => {
      const cfg = await prisma.channelConfig.findUnique({
        where: { businessId_channel: { businessId, channel } },
      })
      if (!cfg || !cfg.isActive) {
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

      return { config, credentials, provider: cfg.provider || undefined }
    },
    { ttl: 60, l1Only: false }
  )

  if (data) {
    lastUsedQueue.set(lastUsedKey, Date.now())
  }
  return data
}

/**
 * Clear the cache for a (business, channel) pair — call this when
 * the business rotates credentials or disables the channel.
 */
export async function clearChannelCache(businessId?: string, channel?: string): Promise<void> {
  if (!businessId) {
    await invalidatePrefix('ch:')
    return
  }
  if (channel) {
    await invalidate(cacheKeys.channel(businessId, channel))
  } else {
    await invalidatePrefix(`ch:${businessId}:`)
  }
}
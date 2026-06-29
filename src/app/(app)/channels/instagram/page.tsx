import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Instagram, CheckCircle2, XCircle, Image as ImageIcon, Sparkles, Heart, MessageCircle, ExternalLink, AlertCircle, Calendar, Bot } from 'lucide-react'
import Link from 'next/link'
import { InstagramClient } from './instagram-client'

export const dynamic = 'force-dynamic'

export default async function InstagramChannelPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })
  const channelConfig = await prisma.channelConfig.findUnique({
    where: { businessId_channel: { businessId, channel: 'instagram' } },
  })

  // Try real Instagram stats from Graph API; fall back to a friendly empty state.
  let stats = {
    followers: 0,
    posts: 0,
    reach7d: 0,
    engagement: 0,
    aiGenerated: 0,
  }
  if (channelConfig?.isActive && channelConfig.credentials) {
    try {
      const { decryptJSON } = await import('@/lib/kms')
      const creds = await decryptJSON<Record<string, string>>(channelConfig.credentials, businessId)
      const accessToken = creds.accessToken
      const igUserId = creds.businessAccountId
      if (accessToken && igUserId) {
        const profileRes = await fetch(
          `https://graph.facebook.com/v19.0/${igUserId}?fields=followers_count,media_count&access_token=${encodeURIComponent(accessToken)}`,
          { cache: 'no-store' }
        )
        if (profileRes.ok) {
          const p = await profileRes.json()
          stats.followers = p.followers_count || 0
          stats.posts = p.media_count || 0
        }
        const insightsRes = await fetch(
          `https://graph.facebook.com/v19.0/${igUserId}/insights?metric=reach&period=day&access_token=${encodeURIComponent(accessToken)}`,
          { cache: 'no-store' }
        )
        if (insightsRes.ok) {
          const i = await insightsRes.json()
          const last7 = (i.data?.[0]?.values || []).slice(-7)
          stats.reach7d = last7.reduce((s: number, v: any) => s + (v.value || 0), 0)
        }
      }
    } catch {
      // Stats are best-effort — don't break the page
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Instagram className="w-7 h-7 text-pink-600" />
            Instagram Channel
          </h1>
          <p className="text-ink-600 mt-1">AI generates and posts educational content, offers, before/after</p>
        </div>
        <Badge variant={business?.instagramConnected ? 'success' : 'secondary'} className="text-sm px-3 py-1.5">
          {business?.instagramConnected ? <><CheckCircle2 className="w-4 h-4 mr-1" />Connected</> : <><XCircle className="w-4 h-4 mr-1" />Not connected</>}
        </Badge>
      </div>

      <Card className="border-pink-200 bg-pink-50/40">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Bot className="w-5 h-5 text-pink-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-pink-900">What AI does on Instagram</div>
              <p className="text-sm text-pink-800 mt-1">
                Connect your Instagram Business account and AI will:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-pink-900">
                <li>✨ <strong>Auto-generate captions</strong> from your knowledge base in Hinglish</li>
                <li>📅 <strong>Schedule posts</strong> at optimal times (9 AM, 1 PM, 7 PM IST)</li>
                <li>💬 <strong>Reply to DMs & comments</strong> with your AI assistant</li>
                <li>📲 <strong>Cross-channel leads</strong> — Instagram inquiries → WhatsApp conversation</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <InstagramClient
        connected={!!business?.instagramConnected}
        channelConfigId={channelConfig?.id || null}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Followers</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.followers.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Posts</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.posts.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Reach (7d)</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.reach7d.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Engagement</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.engagement.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">AI captions</div>
            <div className="text-2xl font-bold text-purple-700 mt-1">{stats.aiGenerated}</div>
            <div className="text-[10px] text-ink-400 mt-0.5">this month</div>
          </CardContent>
        </Card>
      </div>

      {!business?.instagramConnected && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-ink-900">Connect your Instagram Business account</div>
                <p className="text-sm text-ink-600 mt-1">
                  Go to <Link href="/settings" className="text-teal-600 underline">Settings → Integrations → Instagram</Link> to enter your access token. You'll need a Facebook App with Instagram Basic Display + a long-lived token (60 days).
                </p>
                <Link href="https://developers.facebook.com/docs/instagram-api/getting-started" target="_blank" className="text-amber-700 underline mt-2 inline-block text-sm flex items-center gap-1">
                  Instagram API getting started <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Boost your AI captions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-600 mb-3">
            The more AI knows about your business, the better your captions. Add FAQs, before/after stories, and service details to your knowledge base.
          </p>
          <Link href="/knowledge" className="text-teal-600 underline text-sm flex items-center gap-1">
            <Calendar className="w-3 h-3" />Build your knowledge base so AI can write better captions
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Instagram, CheckCircle2, XCircle, Image as ImageIcon, Sparkles, Heart, MessageCircle, ExternalLink, AlertCircle, Calendar } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function InstagramChannelPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })

  // Mock stats (in production, fetch from Instagram Graph API)
  const stats = {
    followers: 320,
    posts: 47,
    reach: 1820,
    engagement: 156,
    aiGeneratedPosts: 23,
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

      {!business?.instagramConnected && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-amber-900">Instagram not connected</div>
                <div className="text-sm text-amber-800 mt-1">
                  Connect your Instagram Business account to enable AI auto-posting.
                </div>
                <pre className="mt-3 p-3 bg-white border border-amber-200 rounded text-xs">
{`INSTAGRAM_ACCESS_TOKEN="IGQVJxxx..."
INSTAGRAM_BUSINESS_ID="17841234567890"`}
                </pre>
                <Link href="https://developers.facebook.com/docs/instagram-api" target="_blank" className="text-amber-700 underline mt-2 inline-block text-sm flex items-center gap-1">
                  Get Instagram API access <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Followers</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.followers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Posts</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.posts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Reach (7d)</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.reach}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">Engagement</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{stats.engagement}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-ink-500 uppercase tracking-wider">AI posts</div>
            <div className="text-2xl font-bold text-purple-700 mt-1">{stats.aiGeneratedPosts}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What AI does on Instagram</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Feature icon={Sparkles} title="Auto-generate captions" desc="From your knowledge base, AI writes 30 captions/month in Hinglish" />
            <Feature icon={ImageIcon} title="Schedule posts" desc="AI posts at optimal times (9 AM, 1 PM, 7 PM IST)" />
            <Feature icon={Heart} title="Engage with comments" desc="AI responds to common DMs and comments" />
            <Feature icon={MessageCircle} title="Cross-channel leads" desc="Instagram inquiries → WhatsApp conversation" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-600 mb-3">
            Instagram auto-posting is in development. Connect your account to be ready when it launches.
          </p>
          <Link href="/knowledge" className="text-teal-600 underline text-sm flex items-center gap-1">
            <Calendar className="w-3 h-3" />Build your knowledge base so AI can write better captions
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function Feature({ icon: Icon, title, desc }: any) {
  return (
    <div className="flex items-start gap-3 p-3 border border-ink-100 rounded-lg">
      <Icon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-ink-500">{desc}</div>
      </div>
    </div>
  )
}
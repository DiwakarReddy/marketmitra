import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Star, Gift, Calendar, Sparkles, AlertTriangle, Settings, TrendingUp, MessageCircle, CheckCircle2 } from 'lucide-react'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AutomationPage() {
  const session = await getServerSession(authOptions)
  const businessId = (session as any)?.businessId

  if (!businessId) {
    return <div className="p-6">Please sign in</div>
  }

  const business = await prisma.business.findUnique({ where: { id: businessId } })

  // Stats
  const [reviewSends, birthdaySends, festivalSends, confirmSends, recurringPending, noShows, highRisk] = await Promise.all([
    prisma.automationEvent.count({ where: { businessId, type: 'review_request' } }),
    prisma.automationEvent.count({ where: { businessId, type: 'birthday_wish' } }),
    prisma.automationEvent.count({ where: { businessId, type: 'festival_offer' } }),
    prisma.automationEvent.count({ where: { businessId, type: 'confirmation_request' } }),
    prisma.appointment.count({ where: { businessId, status: 'pending_confirmation' } }),
    prisma.appointment.count({ where: { businessId, status: 'no_show', startsAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    prisma.appointment.count({
      where: {
        businessId,
        status: 'booked',
        startsAt: { gte: new Date() },
        noShowScore: { gte: 0.5 },
      },
    }),
  ])

  // Recent automation events
  const recentEvents = await prisma.automationEvent.findMany({
    where: { businessId },
    orderBy: { sentAt: 'desc' },
    take: 30,
    include: { customer: { select: { name: true } } },
  })

  // Upcoming birthdays this week
  const today = new Date()
  const weekLater = new Date(today.getTime() + 7 * 86400000)
  const allCustomers = await prisma.customer.findMany({
    where: { businessId, optedOut: false },
    select: { id: true, name: true, birthday: true, anniversary: true, phone: true },
  })
  const upcomingBirthdays = allCustomers.filter((c) => {
    if (!c.birthday) return false
    const bday = new Date(c.birthday)
    bday.setFullYear(today.getFullYear())
    if (bday < today) bday.setFullYear(today.getFullYear() + 1)
    return bday.getTime() <= weekLater.getTime() && bday.getTime() >= today.getTime()
  })

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink-900 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-teal-600" />
            Smart Automations
          </h1>
          <p className="text-ink-600 mt-1">5 automations that work for you 24/7 — reviews, birthdays, festivals, no-shows, recurring.</p>
        </div>
        <Button variant="brand" asChild>
          <a href="/settings"><Settings className="w-4 h-4" />Configure</a>
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Star className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-900">{reviewSends}</div>
                <div className="text-xs text-ink-500">Reviews asked</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                <Gift className="w-5 h-5 text-pink-700" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-900">{birthdaySends}</div>
                <div className="text-xs text-ink-500">Birthday wishes</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-purple-700" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-900">{festivalSends}</div>
                <div className="text-xs text-ink-500">Festival campaigns</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-blue-700" />
              </div>
              <div>
                <div className="text-2xl font-bold text-ink-900">{confirmSends}</div>
                <div className="text-xs text-ink-500">Confirmations sent</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* The 5 automations */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AutomationCard
          icon={Star}
          color="amber"
          name="Google review requests"
          desc="2 hours after every visit, customer gets a WhatsApp asking for a Google review."
          stat={reviewSends}
          statLabel="reviews asked"
          enabled={!!business?.googleReviewUrl}
          setupHref="/settings#review"
        />
        <AutomationCard
          icon={Gift}
          color="pink"
          name="Birthday & anniversary wishes"
          desc="Personalized wish sent at 9 AM on customer's birthday with a special offer."
          stat={birthdaySends}
          statLabel="wishes sent"
          enabled={!!business?.birthdayWishesEnabled}
          setupHref="/settings#birthday"
        />
        <AutomationCard
          icon={Calendar}
          color="purple"
          name="Festival campaigns"
          desc="AI-generated offers for 18 Indian festivals. Sends to all customers 3 days before."
          stat={festivalSends}
          statLabel="campaigns sent"
          enabled={!!business?.festivalCampaignsEnabled}
          setupHref="/settings#festivals"
        />
        <AutomationCard
          icon={TrendingUp}
          color="teal"
          name="Recurring appointments"
          desc="Auto-schedules next visit (e.g. 6 months for dental). Customer confirms via WhatsApp."
          stat={recurringPending}
          statLabel="pending confirmation"
          enabled={true}
          setupHref="/settings#recurring"
        />
        <AutomationCard
          icon={AlertTriangle}
          color="red"
          name="No-show prediction"
          desc="AI scores each appointment 0-1. High-risk customers get a confirmation request."
          stat={highRisk}
          statLabel="high-risk upcoming"
          enabled={!!business?.noShowPredictionEnabled}
          setupHref="/settings#noshow"
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">30-day impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-600">No-shows (last 30d)</span>
              <span className="font-bold text-ink-900">{noShows}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">Automation events</span>
              <span className="font-bold text-ink-900">{reviewSends + birthdaySends + festivalSends + confirmSends}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-600">Hours saved</span>
              <span className="font-bold text-teal-700">~{(reviewSends + birthdaySends + festivalSends + confirmSends) * 0.25}h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming birthdays */}
      {upcomingBirthdays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-pink-600" />
              Upcoming birthdays this week
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-ink-100">
              {upcomingBirthdays.map((c) => {
                const bday = new Date(c.birthday!)
                bday.setFullYear(today.getFullYear())
                if (bday < today) bday.setFullYear(today.getFullYear() + 1)
                const days = Math.floor((bday.getTime() - today.getTime()) / 86400000)
                return (
                  <div key={c.id} className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center">
                      <Gift className="w-4 h-4 text-pink-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-ink-900">{c.name}</div>
                      <div className="text-xs text-ink-500">{c.phone}</div>
                    </div>
                    <Badge variant="secondary">
                      {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `in ${days} days`}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent activity feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-teal-600" />
            Recent automation activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentEvents.length === 0 ? (
            <div className="p-8 text-center text-ink-500 text-sm">
              No automation events yet. They'll appear here as soon as customers visit, have birthdays, or book appointments.
            </div>
          ) : (
            <div className="divide-y divide-ink-100 max-h-[500px] overflow-y-auto">
              {recentEvents.map((e) => (
                <div key={e.id} className="p-4 flex items-start gap-3 hover:bg-ink-50/50">
                  <div className="w-8 h-8 bg-ink-50 rounded-full flex items-center justify-center flex-shrink-0">
                    {getEventIcon(e.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-ink-900 text-sm">{getEventLabel(e.type)}</span>
                      {e.customer && <span className="text-xs text-ink-500">→ {e.customer.name}</span>}
                    </div>
                    <div className="text-xs text-ink-600 truncate">{e.message}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">
                      {new Date(e.sentAt).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <Badge variant={e.status === 'sent' ? 'success' : 'danger'}>{e.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AutomationCard({ icon: Icon, color, name, desc, stat, statLabel, enabled, setupHref }: any) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-100`}>
            <Icon className={`w-5 h-5 text-${color}-700`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-ink-900 text-sm">{name}</h3>
              <Badge variant={enabled ? 'success' : 'secondary'}>{enabled ? 'ON' : 'OFF'}</Badge>
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">{desc}</p>
          </div>
        </div>
        <div className="flex items-end justify-between pt-3 border-t border-ink-100">
          <div>
            <div className="text-2xl font-bold text-ink-900">{stat}</div>
            <div className="text-xs text-ink-500">{statLabel}</div>
          </div>
          {!enabled && (
            <Button size="sm" variant="outline" asChild>
              <a href={setupHref}>Set up</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function getEventIcon(type: string) {
  switch (type) {
    case 'review_request': return <Star className="w-4 h-4 text-amber-600" />
    case 'birthday_wish': return <Gift className="w-4 h-4 text-pink-600" />
    case 'anniversary_wish': return <Gift className="w-4 h-4 text-pink-600" />
    case 'festival_offer': return <Calendar className="w-4 h-4 text-purple-600" />
    case 'confirmation_request': return <CheckCircle2 className="w-4 h-4 text-blue-600" />
    case 'recurring_reminder': return <TrendingUp className="w-4 h-4 text-teal-600" />
    case 'no_show_warning': return <AlertTriangle className="w-4 h-4 text-red-600" />
    default: return <MessageCircle className="w-4 h-4 text-ink-500" />
  }
}

function getEventLabel(type: string) {
  switch (type) {
    case 'review_request': return 'Review request'
    case 'birthday_wish': return 'Birthday wish'
    case 'anniversary_wish': return 'Anniversary wish'
    case 'festival_offer': return 'Festival offer'
    case 'confirmation_request': return 'Confirmation request'
    case 'recurring_reminder': return 'Recurring appointment'
    case 'no_show_warning': return 'No-show warning'
    default: return type
  }
}
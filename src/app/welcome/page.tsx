import Link from 'next/link'
import { ArrowRight, MessageSquare, Phone, Instagram, Target, Sparkles, CheckCircle2, BarChart3 } from 'lucide-react'

// Public marketing landing page at /welcome
// (Root / is now a smart redirect based on auth state)

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-ink-50 via-white to-teal-50">
      <header className="border-b border-ink-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <div className="w-9 h-9 gradient-brand rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <div className="font-bold text-ink-900 text-base leading-tight">MarketMitra</div>
              <div className="text-[10px] text-ink-500 leading-tight">तुम्हारा AI मार्केटिंग दोस्त</div>
            </div>
          </Link>
          <nav className="flex items-center gap-6 text-sm text-ink-700">
            <Link href="/welcome#features" className="hover:text-ink-900">Features</Link>
            <Link href="/welcome#how" className="hover:text-ink-900">How it works</Link>
            <Link href="/plans" className="hover:text-ink-900">Pricing</Link>
            <Link href="/login" className="text-ink-600 hover:text-ink-900">Sign in</Link>
            <Link href="/signup" className="gradient-brand text-white px-4 py-2 rounded-lg font-medium flex items-center gap-1.5">
              Open app <ArrowRight className="w-4 h-4" />
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-3 py-1 rounded-full text-xs font-medium mb-6">
          <Sparkles className="w-3 h-3" />
          AI marketing for India SMBs
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-ink-900 tracking-tight leading-tight">
          Your AI marketer.<br />
          <span className="gradient-brand bg-clip-text text-transparent">Works 24/7 in Hinglish.</span>
        </h1>
        <p className="text-lg text-ink-600 mt-6 max-w-2xl mx-auto">
          WhatsApp + Voice + Instagram + Google Ads, all in one platform. AI talks to your customers, books appointments, and gets you reviews. You just see the bookings roll in.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href="/signup" className="gradient-brand text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 shadow-lg">
            Start free trial <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/plans" className="text-ink-700 px-6 py-3 rounded-lg font-medium hover:bg-white">
            See pricing
          </Link>
        </div>
        <p className="text-xs text-ink-500 mt-4">No credit card • 14-day free trial • Setup in 20 minutes</p>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center text-ink-900 mb-12">4 channels, 1 AI brain</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <Feature icon={MessageSquare} title="WhatsApp" desc="AI replies in Hinglish, books appointments, sends reminders" color="green" />
          <Feature icon={Phone} title="Voice AI" desc="AI calls past customers to re-engage them" color="purple" />
          <Feature icon={Instagram} title="Instagram" desc="AI posts content and replies to DMs" color="pink" />
          <Feature icon={Target} title="Google Ads" desc="AI manages your ad campaigns 24/7" color="blue" />
        </div>
      </section>

      <section id="how" className="bg-white border-y border-ink-100 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-ink-900 mb-12">20-minute setup, then AI takes over</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step n={1} title="Tell us your business" desc="Name, services, prices, hours" />
            <Step n={2} title="Connect your channels" desc="WhatsApp, Voice, Instagram, Google Ads" />
            <Step n={3} title="AI gets to work" desc="Crafts campaigns in your language, talks to customers, books appointments" />
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-ink-900 mb-4">Outcome-based pricing</h2>
        <p className="text-lg text-ink-600">You only pay when AI books a customer. No seat fees. No impressions charged.</p>
        <div className="mt-8">
          <Link href="/plans" className="gradient-brand text-white px-6 py-3 rounded-lg font-semibold inline-flex items-center gap-2">
            See plans <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-100 py-8 text-center text-sm text-ink-500">
        © 2026 MarketMitra. Built in India for India.
      </footer>
    </div>
  )
}

function Feature({ icon: Icon, title, desc, color }: any) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
    pink: 'bg-pink-100 text-pink-700',
    blue: 'bg-blue-100 text-blue-700',
  }
  return (
    <div className="bg-white p-6 rounded-2xl border border-ink-100 shadow-sm hover:shadow-md transition">
      <div className={`w-12 h-12 ${colors[color]} rounded-xl flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-bold text-ink-900 mb-1">{title}</h3>
      <p className="text-sm text-ink-600">{desc}</p>
    </div>
  )
}

function Step({ n, title, desc }: any) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 gradient-brand text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">{n}</div>
      <h3 className="font-bold text-ink-900 mb-1">{title}</h3>
      <p className="text-sm text-ink-600">{desc}</p>
    </div>
  )
}
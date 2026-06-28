# MarketMitra — Project Documentation

> **What it is:** AI marketing OS for India SMBs. WhatsApp + Voice + Instagram + Google Ads in one platform. Hinglish + 9 Indian languages. Outcome-based pricing (per booking).

---

## Table of Contents
1. [Quick Start](#quick-start)
2. [Current Production State](#current-production-state)
3. [What's Built (v1-v14)](#whats-built)
4. [Known Issues & Bugs](#known-issues)
5. [Pending from Latest Conversation](#pending-from-conversation)
6. [Roadmap (Future)](#roadmap)
7. [Architecture & Tech Stack](#architecture)
8. [File Structure (Key Files)](#file-structure)
9. [Database Schema](#database-schema)
10. [How to Continue Development](#how-to-continue)

---

## Quick Start

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Local development (SQLite)
DATABASE_URL="file:./dev.db" npx prisma db push
DATABASE_URL="file:./dev.db" npm run db:demo
npm run dev
# → http://localhost:3000

# Demo logins (password: demo1234)
#   priya@smilecare.demo  (Hinglish, Starter plan)
#   rahul@smiledental.demo (Hindi, Growth plan)
#   anjali@pearlsmile.demo (English, Scale plan)
```

---

## Current Production State

### What's deployed
- ✅ **Code:** GitHub → https://github.com/DiwakarReddy/marketmitra (public)
- ✅ **Hosting:** Vercel Hobby plan
- ✅ **Database:** Vercel Postgres (powered by Neon)
- ✅ **Region:** Washington, USA (iad1) — was originally Mumbai but switched
- ✅ **Last deploy URL:** `https://marketmitra-3n7nlmecn-marketmitra.vercel.app` (CLI-generated)

### What's working
- ✅ Next.js 14 app builds + deploys
- ✅ Postgres migrations applied
- ✅ Demo seed runs (with bcrypt password hashes — fixed in latest local file)
- ✅ Health endpoint returns 200 with `USE_NEON_ADAPTER=false`
- ✅ Login page loads at `/login`

### What's NOT working (KNOWN BUGS)
- ❌ Demo seed fails on user's local copy — old `TRUNCATE` references non-existent tables (`KnowledgeDoc`, `WidgetConfig`, `Integration`)
- ❌ Once seed runs, login should work but unverified
- ❌ `t.mask is not a function` error in webhook logs (cosmetic, doesn't block login)
- ❌ `Watermark` import issue in some chunks

---

## What's Built

### v1-v6: MVP Build
- Multi-tenant WhatsApp Cloud API (Meta direct, AiSensy, 360dialog)
- Customer management + CRM
- Campaign broadcasts with A/B testing
- Booking widget (embeddable)
- Email + calendar integration
- CSV import/export
- Failed message retry queue
- GST invoice PDF generation
- AI inbox replies (basic)

### v7: AI + Auth Fixes
- Google Gemini AI integration
- Auth callback 405 fix

### v8: Plans + Internationalization
- 3-tier pricing: Starter ₹3K/mo, Growth (per-booking), Scale (per-booking)
- i18n support (EN, HI, Hinglish)
- Dunning system (5 escalating messages)
- Admin panel

### v9: Tier 1 Automations
- Google review request automation
- Birthday wishes (with offer %)
- Anniversary wishes
- Recurring appointments (6-month cleaning recall etc.)
- Festival campaigns (18 Indian festivals pre-loaded)
- No-show prediction + confirmation requests
- New models: `AutomationEvent`, `Festival`

### v10: All Pages Completed
- Working integrations (Connect/Disconnect flows)
- Team invites + 2FA TOTP
- Notification system
- Timezone/currency selector
- Data export
- Pause/delete account
- Change password
- Inbox: search, filters, notes, labels
- Calendar: drag-drop
- Customers: bulk actions, edit
- Campaigns: 4-step creator with AI gen + A/B test
- Leads funnel view
- Approvals bulk actions
- Failed messages retry
- Channel config UIs
- Knowledge editor
- Templates editor
- Widget live preview
- Billing invoice history
- Dashboard real-time + goals

### v11: Multi-Tenant Credentials
- New `ChannelConfig` model (per-business channel credentials)
- AES-256-GCM encryption for credentials
- 8 supported channels (WhatsApp, Voice, Instagram, Google Ads, Calendar, Razorpay, OpenAI, Google AI)
- Per-tenant credential resolution with caching
- Channel tester (validates creds work before save)
- Credentials modal (dynamic fields per channel)
- `/api/channels` + `/api/channels/[name]` routes
- `/admin/channels` founder view

### v12: Security & Observability
- Audit log (`ChannelConfigAudit` model — actor, IP, UA, changes diff)
- `lastUsedAt` tracking (debounced 30s)
- Rate limiting (5 connects/5min via `lib/rate-limit.ts`)
- KMS envelope encryption (`lib/kms.ts` with AWS/GCP/Vault abstraction + HKDF local mode)
- Test send button
- Per-tenant webhook signature verification (HMAC-SHA256 per-business)
- Key rotation cron (90d reminder, 365d force)
- Production audit at `/workspace/marketmitra/AUDIT.md` (75+ issues)

### v13: 8 User-Reported Fixes
1. ✅ Sidebar dynamic business info (from `/api/me/business`)
2. ✅ Channel masking in API responses (`hasCredentials: boolean` only)
3. ✅ Platform key usage tracking + monthly surcharge billing
4. ✅ Root page redirect (`/` → `/dashboard` if logged in, `/login` if not)
5. ✅ Removed hardcoded "SmileCare" / fake phone numbers from templates
6. ✅ i18n expanded to 10 languages (EN, HI, Hinglish, TA, TE, KN, BN, MR, GU, PA)
7. ✅ Per-tenant webhook URLs (`/api/webhook/[businessId]/[channel]`)
8. ✅ Plan-based feature gating (`lib/plan-features.ts` matrix)

### v13.1: 13 Edge Case Fixes
1. 🔴 Critical: AI usage double-counting (fixed — was called twice in platform path)
2. 🔴 Critical: Webhook creates duplicate customers on Meta retries (idempotency cache 5min)
3. 🔴 High: Phone format normalization (Meta/Twilio/AiSensy/Gupshup)
4. 🔴 High: Trial plan handled explicitly (not falling back to starter)
5. 🔴 High: Per-provider signature verification (Twilio HMAC-SHA1)
6. 🟡 Med: Delivery/read receipt handling (status updates applied to messages)
7. 🟡 Med: Language toggle UI for all 10 languages
8. 🟢 Low: Audit log changes stores field names only (not values)
9. 🟢 Low: Plan gating doesn't hide google_calendar/razorpay
10. 🔴 High: Webhook signature length safety (timingSafeEqual)
11. 🔴 High: Business deleted/paused checks in webhook
12. 🟡 Med: AI usage reset race condition (atomic updateMany)
13. 🟢 Low: Paused/suspended banners in dashboard/billing

### v14: Production-Ready
- SQLite → PostgreSQL migration
- Neon adapter for serverless (now opt-in only via `USE_NEON_ADAPTER=true`)
- Real migration files in `prisma/migrations/0_init/`
- `vercel.json` with cron jobs
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy)
- `/api/health` endpoint (DB + business count + 24h messages)
- Env validation (`src/lib/env.ts`)
- PII redaction in logs (`src/lib/log.ts`)
- Demo seed (`prisma/seed-demo.ts`) — 3 dental clinics
- Updated `.env.example` with all production vars
- `DEPLOY.md` walkthrough

---

## Known Issues

### Critical (blocks production)
- ⚠️ **Webhook signature timingSafeEqual crash on length mismatch** — fixed in code but verify in production
- ⚠️ **Login fails without bcrypt password hash** — fixed in seed file (must use latest)
- ⚠️ **Local seed has stale TRUNCATE statement** — needs update from `/workspace/marketmitra/prisma/seed-demo.ts`

### High
- 🟡 **`t.mask is not a function` error** in some webhook chunks — likely webpack tree-shaking issue, doesn't block core flows
- 🟡 **Audit log PII redaction** added but not applied to all `console.log` calls
- 🟡 **Webhook async processing** — currently synchronous; for high volume should use background queue

### Medium
- 🟢 **Sidebar business card flashes** during loading — needs skeleton/suspense
- 🟢 **Mobile responsive** — most pages desktop-first, mobile needs polish
- 🟢 **Empty states** — many pages lack proper empty state UI
- 🟢 **Error boundaries** — most pages don't have React error boundaries

### Low
- 🟢 **A11y** — keyboard navigation, screen reader labels, focus management
- 🟢 **Dark mode** — design system has ink/teal tokens but no dark variant
- 🟢 **Onboarding tour** — no guided walkthrough for new users
- 🟢 **Toast notifications** — exists but inconsistent across pages
- 🟢 **Loading skeletons** — many pages show spinner instead of skeletons

### Audit (from AUDIT.md — 75+ items)
- 25 P0 items (security, data integrity)
- 30+ P1 items (UX, performance)
- 20+ P2 items (polish)

---

## Pending from Conversation

### Immediate (must do next session)
1. **Update local `seed-demo.ts`** with correct TRUNCATE tables
2. **Run seed** on Vercel Postgres
3. **Verify login works** end-to-end
4. **Fix `t.mask is not a function`** bug — investigate webhook-utils.ts
5. **Fix GitHub repo visibility** — currently public (security concern for production)
6. **Verify `NEXTAUTH_URL`** matches deployed Vercel URL in env vars

### Short-term (this week)
1. **Add Sentry** for error monitoring
2. **Add Upstash Redis** for rate limiting + idempotency cache (currently in-memory)
3. **Test full webhook flow** with real Meta WhatsApp setup
4. **Test cron jobs** via Vercel dashboard
5. **Configure custom domain** (deferred per user)

### Strategic (from competitive analysis)
1. **Switch voice to WhatsApp Business Calling API** (free vs Twilio)
2. **Build dental clinic vertical wedge** (3 automations + onboarding tweaks)
3. **Multi-lingual voice AI** (Tamil, Telugu, Bengali regional support)
4. **Meta Business AI tracker** (awareness dashboard)
5. **Partnerships with Sarvam AI** for Indian language models (later)

---

## Roadmap (Future)

### Q1 2026 (next 3 months)
- [ ] **Dental wedge:** vertical-specific onboarding (5 new fields), 3 dental automations, dental-themed landing page
- [ ] **Regional voice AI:** Tamil, Telugu, Bengali languages (currently only English/Hindi)
- [ ] **WhatsApp Calling API:** free voice calls inside WhatsApp (no Twilio fees)
- [ ] **WhatsApp Flows:** native booking UI inside WhatsApp
- [ ] **100 customer milestone** — get first 100 paying dental clinics

### Q2 2026
- [ ] **Salon vertical wedge** (replicate dental playbook)
- [ ] **Multi-location support** (Scale plan tier)
- [ ] **API access** for enterprise customers
- [ ] **White-glove onboarding** for ₹1L+/mo customers
- [ ] **Webhooks for customers** (let businesses subscribe to events)

### Q3 2026
- [ ] **Custom domain for booking widget** (per-business URLs)
- [ ] **Mobile app** (React Native, optional)
- [ ] **Advanced analytics** (cohort, retention, attribution)
- [ ] **A/B test automation** for broadcasts

### Future
- [ ] **Marketplace** for templates, automations
- [ ] **Agency plan** (manage multiple businesses)
- [ ] **Internationalization beyond India** (SEA, MENA)

---

## Architecture

### Tech Stack
- **Framework:** Next.js 14 (App Router, Server Actions)
- **Language:** TypeScript
- **Database:** PostgreSQL (Vercel Postgres / Neon under the hood)
- **ORM:** Prisma 5.22 with @prisma/adapter-neon (opt-in)
- **Auth:** NextAuth.js with bcryptjs
- **AI:** Google Gemini 1.5 Flash (default), OpenAI gpt-4o-mini (fallback)
- **WhatsApp:** Meta Cloud API direct, AiSensy, 360dialog, Twilio
- **Voice:** Twilio (future: WhatsApp Business Calling API)
- **Hosting:** Vercel (Node runtime)
- **Cache/Rate Limit:** In-memory (production needs Upstash Redis)
- **Email:** Resend (planned)
- **Error Tracking:** Sentry (planned)
- **Payments:** Razorpay
- **Encryption:** AES-256-GCM with HKDF-derived per-business keys

### Design Principles
1. **Multi-tenant by default** — every business brings own channel credentials (BYOK)
2. **Outcome pricing** — pay per booking, not per seat/message
3. **Hinglish-first UI** — 10 Indian languages supported
4. **Per-tenant webhooks** — unique URL per business for routing
5. **KMS-ready encryption** — local HKDF now, AWS/GCP/Vault later
6. **Webhook idempotency** — prevent duplicates from Meta retries
7. **Plan-based gating** — features/channels hidden if not in plan

---

## File Structure (Key Files)

```
marketmitra/
├── prisma/
│   ├── schema.prisma           # 23 models
│   ├── migrations/0_init/      # Production migration SQL
│   ├── seed.ts                 # Original seed (legacy)
│   └── seed-demo.ts            # 3 dental clinics demo seed (USE THIS)
├── src/
│   ├── lib/
│   │   ├── db.ts               # Prisma client (Neon adapter opt-in)
│   │   ├── env.ts              # Env validation
│   │   ├── auth.ts             # NextAuth config (bcrypt)
│   │   ├── ai.ts               # Gemini/OpenAI integration
│   │   ├── whatsapp.ts         # Meta/AiSensy/Twilio send
│   │   ├── webhook-utils.ts    # Idempotency, signatures, phone normalization
│   │   ├── log.ts              # PII redaction for logs
│   │   ├── encryption.ts       # AES-256-GCM
│   │   ├── kms.ts              # KMS abstraction (local HKDF mode)
│   │   ├── plans.ts            # Plan tiers
│   │   ├── plan-features.ts    # Feature matrix per plan
│   │   ├── i18n.ts             # 10 languages
│   │   ├── channel-schemas.ts  # 8 channels
│   │   ├── channel-resolver.ts # Per-tenant creds + cache
│   │   ├── channel-tester.ts   # Test channel connections
│   │   ├── rate-limit.ts       # Rate limiting
│   │   ├── audit.ts            # Audit log helper
│   │   ├── retry.ts            # Reliable send with retry
│   │   ├── pdf.ts              # GST invoice generation
│   │   └── automation/
│   │       ├── reviews.ts      # Google review requests
│   │       ├── birthdays.ts    # Birthday wishes
│   │       ├── anniversaries.ts
│   │       ├── festivals.ts    # 18 Indian festivals
│   │       ├── recurring.ts    # Recurring appointments
│   │       ├── noshow.ts       # No-show prediction
│   │       ├── dunning.ts      # Failed payment messages
│   │       ├── key-rotation.ts # Channel key rotation
│   │       └── ai-usage.ts     # AI usage tracking
│   ├── app/
│   │   ├── page.tsx            # Smart redirect (auth-based)
│   │   ├── layout.tsx          # Root layout
│   │   ├── welcome/page.tsx    # Marketing landing
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── channels/                  # Per-channel creds
│   │   │   ├── webhook/[businessId]/whatsapp/route.ts  # Per-tenant webhook
│   │   │   ├── whatsapp/webhook/route.ts  # Legacy shared webhook
│   │   │   ├── ai/generate/route.ts       # AI generation
│   │   │   ├── cron/daily/route.ts        # Daily jobs
│   │   │   ├── cron/key-rotation/route.ts # Weekly rotation check
│   │   │   ├── me/business/route.ts       # Current business
│   │   │   ├── me/language/route.ts       # Save UI language
│   │   │   ├── me/ai-usage/route.ts       # AI usage stats
│   │   │   └── health/route.ts            # Health check
│   │   ├── (app)/               # Authenticated pages (sidebar layout)
│   │   │   ├── dashboard/
│   │   │   ├── inbox/
│   │   │   ├── calendar/
│   │   │   ├── campaigns/
│   │   │   ├── customers/
│   │   │   ├── leads/
│   │   │   ├── approvals/
│   │   │   ├── failures/
│   │   │   ├── channels/[type]/   # whatsapp, voice, instagram, google
│   │   │   ├── knowledge/
│   │   │   ├── widget/
│   │   │   ├── templates/
│   │   │   ├── settings/
│   │   │   ├── billing/
│   │   │   ├── plans/
│   │   │   ├── automation/
│   │   │   └── admin/             # Founder-only
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── onboarding/page.tsx
│   └── components/
│       ├── sidebar.tsx
│       ├── business-card-client.tsx
│       ├── language-toggle.tsx
│       ├── credentials-modal.tsx
│       ├── integrations-card.tsx
│       └── ui/                     # shadcn-style primitives
├── vercel.json                    # Cron config + function limits
├── next.config.js                  # CSP, security headers
├── .env.example                    # All env vars documented
└── DEPLOY.md                       # Deployment walkthrough
```

---

## Database Schema

23 models (PostgreSQL):

**Core:**
- `Business` — tenant root, owns all data
- `User` — login user, belongs to Business
- `Account`, `Session`, `VerificationToken` — NextAuth

**CRM:**
- `Customer` — end customer (phone, name, language, tags, visits, LTV)
- `Conversation` — chat thread
- `Message` — individual messages (with delivery tracking)
- `Lead` — sales pipeline

**Scheduling:**
- `Appointment` — booked services
- `Service` — what business offers
- `BusinessHour` — operating hours

**Marketing:**
- `Campaign` — broadcast campaigns
- `Approval` — pending content for review
- `Template` — reusable message templates
- `KnowledgeDoc` — AI knowledge base

**Integrations:**
- `ChannelConfig` — per-tenant channel credentials (encrypted)
- `ChannelConfigAudit` — credential change audit log
- `Integration` — legacy single-channel config

**Automation:**
- `AutomationEvent` — automation runs log
- `Festival` — pre-loaded Indian festivals
- `RecurringAppointment` — recurring schedules

**Billing:**
- `Invoice` — per-booking billing
- `FailedMessage` — retry queue

**Team:**
- `TeamInvite` — pending invites

**Misc:**
- `Activity` — audit log
- `VoiceCall` — voice AI calls

---

## How to Continue Development

### Continue in MiniMax Code Desktop

1. **Open the project folder** in MiniMax Code: `~/Desktop/Github/projects/marketmitra`
2. **Open Terminal** in MiniMax Code (Cmd+`)
3. **Run local dev:**
   ```bash
   DATABASE_URL="file:./dev.db" npx prisma db push
   DATABASE_URL="file:./dev.db" npm run db:demo
   npm run dev
   ```

### When you're ready to deploy changes to Vercel

```bash
cd ~/Desktop/Github/projects/marketmitra

# 1. Make your code changes
# 2. Test locally

# 3. Commit + push to GitHub
git add .
git commit -m "Description of changes"
git push

# 4. Deploy to Vercel
vercel --prod

# 5. If you added database changes:
URL=$(grep '^DATABASE_URL=' .env.production | sed 's/^DATABASE_URL=//' | tr -d '"' | tr -d "'")
DATABASE_URL="$URL" ./node_modules/.bin/prisma migrate deploy
```

### If you want to continue from where we left off (production deployment)

The state is:
- ✅ Code pushed to GitHub (public repo)
- ✅ Vercel project deployed
- ✅ Database provisioned
- ⚠️ Migrations applied BUT seed needs fresh run with bcrypt hashes
- ⚠️ Login unverified — needs testing

**Next actions to complete deployment:**
1. Fix the local `prisma/seed-demo.ts` (replace TRUNCATE block)
2. Run `npm run db:demo` against Vercel Postgres
3. Test login at the deployed URL
4. Fix `t.mask is not a function` bug if it appears
5. Configure custom domain (when ready)

---

## Files to read first when continuing

1. **PROJECT.md** (this file) — overview
2. **DEPLOY.md** — production deployment walkthrough
3. **AUDIT.md** — production readiness issues (75+ items)
4. **prisma/schema.prisma** — database structure
5. **src/lib/plan-features.ts** — plan/feature matrix
6. **src/lib/webhook-utils.ts** — webhook hardening patterns

---

## Competitive Context (from earlier analysis)

**MarketMitra positioning:**
- vs **AiSensy, Wati, Interakt, Gallabox** — we have voice + IG + Google Ads + outcome pricing + 10 Indian languages. They don't.
- vs **Meta Business AI** (free, June 2026) — they have free WhatsApp AI; we have multi-channel + India workflows + automations.
- vs **Yellow.ai, Gupshup** — they're enterprise; we're SMB-priced (₹3K/mo Starter).
- vs **ManyChat** — they're creator-focused; we're business-focused.

**Strategic wedge for next 90 days:** dental clinics in tier-2/3 India cities. ~3 dental-specific automations + vertical onboarding flow.

---

## Key File Paths

| Purpose | Path |
|---|---|
| Database schema | `prisma/schema.prisma` |
| Auth | `src/lib/auth.ts` |
| AI integration | `src/lib/ai.ts` |
| WhatsApp | `src/lib/whatsapp.ts` |
| Webhook hardening | `src/lib/webhook-utils.ts` |
| Plan matrix | `src/lib/plan-features.ts` |
| i18n | `src/lib/i18n.ts` |
| Channels | `src/lib/channel-{schemas,resolver,tester}.ts` |
| Encryption | `src/lib/{encryption,kms}.ts` |
| Automations | `src/lib/automation/*.ts` |
| Demo seed | `prisma/seed-demo.ts` |
| Migration SQL | `prisma/migrations/0_init/migration.sql` |
| Vercel config | `vercel.json` |
| Env vars | `.env.example` |
| Deploy guide | `DEPLOY.md` |

---

## Environment Variables (production)

Required:
- `DATABASE_URL` — Vercel Postgres URL
- `USE_NEON_ADAPTER` — leave empty or `false` (we use standard Prisma)
- `NEXTAUTH_URL` — your deployed URL
- `NEXTAUTH_SECRET` — 44-char base64
- `ENCRYPTION_KEY` — 64-char hex
- `CRON_SECRET` — 64-char hex
- `ADMIN_EMAIL` — founder email for /admin

Recommended:
- `GOOGLE_API_KEY` — Gemini API key (free tier)
- `GEMINI_MODEL` — `gemini-1.5-flash`

Optional (for real WhatsApp):
- `WHATSAPP_PROVIDER` — `meta`
- `WHATSAPP_ACCESS_TOKEN` — permanent Meta token
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`

---

## Demo Walkthrough (for sales)

Once logged in as `priya@smilecare.demo / demo1234`:

1. **Dashboard** — show greeting, today's bookings, KPIs, activity feed
2. **Inbox** — show Hinglish AI replies (need to pre-populate conversations)
3. **Customers** — show 4 customers with realistic Indian names + visit history
4. **Calendar** — show today's appointment
5. **Campaigns** — show 4-step creator with AI generation
6. **Automation** — show 5 automations (review request, birthday, festival, recurring, no-show)
7. **Plans** — show 3-tier pricing (Starter/Growth/Scale)

**Best demo flow:** Start with dashboard, jump to Inbox to show Hinglish AI, then Campaigns to show AI generation. ~5 min total.

---

## Notes for Future Self

- **Demo seed is the SOURCE OF TRUTH** for demo data — don't delete it
- **`/api/health` is your friend** — always check first when debugging
- **All secrets in env vars** — never in code
- **Webhook idempotency uses in-memory cache** — restart loses it, OK for dev, swap to Redis for prod
- **Vercel Hobby has 10s function timeout on free** — paid plan has 60s
- **Neon free tier auto-suspends** — first wake-up takes 5-30 sec
- **Use Vercel Postgres not direct Neon** — avoids the auto-suspend issue
- **`vercel --prod` bypasses GitHub author check** — use when Hobby plan blocks git deploy

---

**Status: v14 production-deployed, login unverified, dental wedge planned for next sprint.**

**Next sprint priorities:**
1. Fix seed + verify login
2. Build dental vertical wedge (3 automations)
3. Switch voice to WhatsApp Calling API
4. Add Sentry for error tracking
# MarketMitra Production-Readiness Audit

**Date:** 2026-06-26
**Version audited:** v10
**Auditor:** PM + UX + Architect + QA + Sr. Eng perspective
**Scope:** 25 pages, 35+ API routes, 18 DB models, 5,500+ LOC frontend

---

## TL;DR — Top 10 Things to Fix Before First Customer

| # | Severity | One-liner | Where |
|---|---|---|---|
| 1 | **P0** | **Rate-limit ALL public APIs** (login, signup, widget/book) — currently unbounded | All routes |
| 2 | **P0** | **No CSRF on POST routes** (only NextAuth has it) | `/api/*` |
| 3 | **P0** | **No production environment validation** — app boots with mock everything | `lib/db.ts`, `lib/auth.ts` |
| 4 | **P0** | **No request validation** — APIs accept any shape (Zod missing) | All POST routes |
| 5 | **P0** | **No error boundaries** — one throw kills the whole page | App layout |
| 6 | **P0** | **Hardcoded business ID fallback** in some places if session missing | Multiple files |
| 7 | **P0** | **No webhook signature verification** on Razorpay | `api/billing/webhook` |
| 8 | **P1** | **No skeleton loaders** — UI flickers on every page | App layout |
| 9 | **P1** | **No mobile responsive design** for sidebar, tables, calendar | Most pages |
| 10 | **P1** | **No structured logging / Sentry** — silent failures | Server-side |

---

## Page-by-Page Audit

### 1. `/` (Landing page)

**Purpose:** Convert visitors → signups
**User:** Prospective SMB owner (dentist, salon, clinic)

#### Existing
- Marketing copy, social proof, CTA buttons
- (Built as static mockup, not the production Next.js app)

#### Missing (P0)
- ❌ **No actual landing page in the Next.js app** — `/` returns the dashboard or login redirect; no marketing site
- ❌ No SEO meta tags (`<title>`, OG image, description)
- ❌ No structured data (Schema.org `Organization`, `SoftwareApplication`)
- ❌ No pricing visible without login
- ❌ No testimonials/case studies
- ❌ No video demo

#### UX Issues
- **P0** Mobile layout not tested
- **P0** No CTA above the fold
- **P1** No exit-intent popup
- **P2** No blog/content marketing surface

#### Engineering
- **P0** Should be a separate static-exported site (Vercel ISR or static export) — not a server-rendered page in the app
- **P1** Add `robots.txt`, `sitemap.xml`
- **P2** Add analytics (Plausible/PostHog)

#### Acceptance Criteria
1. Google Lighthouse score > 90 on mobile and desktop
2. Loads in <2s on 3G
3. CTA click → signup flow < 3 clicks
4. SEO: ranks for "AI WhatsApp marketing India" within 30 days

---

### 2. `/login` & `/signup`

**Purpose:** Onboard new customers
**User:** New user, returning user

#### Existing
- NextAuth credentials provider
- Email + password fields
- "Sign in" / "Sign up" tabs

#### Missing (P0)
- ❌ **No "Forgot password" flow** — critical recovery path missing
- ❌ **No email verification** on signup — anyone can sign up with someone else's email
- ❌ **No password strength meter** on signup
- ❌ **No "show/hide password" toggle**
- ❌ **No rate limiting** on login attempts (brute force risk)
- ❌ **No CAPTCHA / bot protection** (signup spam risk)
- ❌ **No Google OAuth** despite having OAuth scopes in schema

#### Missing (P1)
- ❌ No "magic link" / passwordless option
- ❌ No "remember me" checkbox
- ❌ No 2FA on login (TOTP set up in settings but not enforced)
- ❌ No SSO / SAML for Scale plan customers
- ❌ No signup progress indicator

#### UX Issues
- **P0** No clear error messages for wrong password (silent fail)
- **P0** No email already-in-use feedback during signup
- **P1** Form not keyboard-navigable (tab order, Enter to submit)
- **P1** No loading state during auth (spinner only on button)

#### Engineering
- **P0** `app/api/auth/signup/route.ts` — verify it exists & validates inputs
- **P0** Add `rateLimit()` middleware (use `next-rate-limit` or `upstash/ratelimit`)
- **P0** Add `verifyPassword()` strength (zxcvbn or similar)
- **P0** Hash passwords with bcrypt (cost 12+)
- **P1** Add audit log for `login_success`, `login_failed`, `signup`
- **P1** Session timeout / refresh token rotation
- **P2** "Sign in with Google" button

#### Empty/Loading/Error States
- ❌ No empty state (no message if user enters nothing)
- ❌ No error state for "Account locked" after 5 failed attempts
- ❌ No success state showing "Check your email"

#### Security
- **P0** No password complexity requirements enforced
- **P0** No rate limiting (10k brute force attempts/sec possible)
- **P0** No CSRF on signup endpoint
- **P0** Session secret fallback to placeholder in `.env.example` — must fail boot if missing
- **P1** No session invalidation on password change
- **P1** No device fingerprinting / suspicious login detection

#### Validation Rules
- Email: RFC 5322 compliant
- Password: 8+ chars, mixed case, number, symbol (zxcvbn score ≥ 3)
- Name: 2-100 chars, no special chars
- Phone: Indian format (+91, 10 digits)

#### Enterprise Readiness
- **P0** No SOC 2 logging
- **P0** No GDPR consent checkbox
- **P0** No "data we collect" disclosure

---

### 3. `/dashboard`

**Purpose:** Daily command center
**User:** Owner (daily use), manager (frequent use)

#### Existing
- 4 stat cards (leads, bookings, revenue, chats)
- Monthly goal tracker
- Recent activity feed
- Today's appointments

#### Missing (P0)
- ❌ **No real-time updates** (page shows 30s stale data; needs WebSocket or SSE)
- ❌ **No quick-action buttons** (call customer, send WhatsApp, create campaign)
- ❌ **No "AI insights"** ("3 customers are about to churn")
- ❌ **No notifications dropdown** (failed payments, new approvals, high no-show risk)
- ❌ **No custom date range selector** (only "today" / "month")
- ❌ **No comparison vs industry benchmark**

#### Missing (P1)
- ❌ No exportable reports
- ❌ No customizable widgets
- ❌ No dark mode
- ❌ No "morning briefing" auto-emailed at 9 AM
- ❌ No mobile-first design (current is desktop-only)

#### UX Issues
- **P0** "नमस्ते" greeting is hardcoded — should be personalized
- **P0** Recent activity shows hardcoded mock data
- **P1** Goal is hardcoded 100 — should be configurable
- **P1** No "what changed since yesterday" callout
- **P1** Cards don't have hover/focus states
- **P2** No customizable dashboard layout

#### Engineering
- **P0** `revalidate = 30` won't help if the user expects real-time — need WebSocket or polling
- **P0** Stats query is unindexed — `findMany` + `aggregate` will be slow at 10k+ customers
- **P1** Add `Business.goal` field to schema
- **P1** Materialized view for "today's stats" to avoid recompute

#### Empty/Loading/Error States
- **P0** No loading skeleton — page is blank then content appears
- **P0** No error state if DB query fails (whole page breaks)
- **P1** No empty state for new businesses ("Connect your first channel to see data")

---

### 4. `/inbox` (WhatsApp inbox)

**Purpose:** Reply to customers, take over AI conversations
**User:** Owner (multiple times/day), manager (daily)

#### Existing
- Conversation list with filters
- Search
- Message thread
- Send/take over/release
- Internal notes, labels, customer info panel
- Real-time polling every 5s

#### Missing (P0)
- ❌ **No typing indicator for AI** (already has visual but no "AI is thinking...")
- ❌ **No message templates** in composer (currently 6 hardcoded)
- ❌ **No file/image attachment** support
- ❌ **No voice note support** (critical for Indian SMBs)
- ❌ **No location sharing** ("Share clinic location")
- ❌ **No contact card sharing**
- ❌ **No "Mark as unread"** after taking over

#### Missing (P1)
- ❌ No conversation merge (same customer, 2 conversations)
- ❌ No "starred" messages
- ❌ No "scheduled messages" (send at 9 AM tomorrow)
- ❌ No canned response analytics ("which response closes fastest")
- ❌ No bulk message to conversation list
- ❌ No search within message thread

#### UX Issues
- **P0** No keyboard shortcuts (Cmd+K to search, Esc to close, etc.)
- **P0** No infinite scroll on conversation list
- **P0** Mobile view: panel switching is broken
- **P1** No notification when new message arrives (only every 5s poll)
- **P1** Date separator doesn't show year
- **P2** No "AI confidence" indicator on AI replies

#### Engineering
- **P0** Polling every 5s × N businesses = massive DB load — needs WebSocket or SSE
- **P0** `include: { messages: { take: 200 } }` is unbounded — could be 10k+ messages
- **P0** No pagination on conversation list (`take: 200` hardcoded)
- **P1** Add conversation search index (Postgres FTS or Algolia)
- **P1** No message-level audit log

#### Empty/Loading/Error States
- **P0** Empty state for "No conversations" — needs onboarding CTA
- **P0** Loading skeleton missing
- **P1** Error state if WhatsApp provider fails

#### Security
- **P0** Sending messages should be audit-logged (who, what, when)
- **P0** No PII masking (phone numbers shown in full)
- **P1** No 2FA gate for sending to >100 customers at once

---

### 5. `/calendar`

**Purpose:** View/manage appointments
**User:** Owner (daily), staff (if added)

#### Existing
- Day/Week/List views
- Drag-and-drop reschedule
- Color by status/service
- Edit modal
- Service filter

#### Missing (P0)
- ❌ **No "Print day sheet"** PDF export (dental clinics NEED this for the day)
- ❌ **No staff filter** (when multi-staff is added)
- ❌ **No recurring appointment creation** (only auto-suggested after completion)
- ❌ **No manual appointment creation** (modal is stub)
- ❌ **No calendar export** (iCal/Google Calendar feed)
- ❌ **No reminder customization** per appointment

#### Missing (P1)
- ❌ No "waitlist" management view
- ❌ No "no-show" report
- ❌ No customer notes visible on appointment
- ❌ No service duration drag-resize
- ❌ No multi-day selection
- ❌ No timezone display (assumes local)

#### UX Issues
- **P0** Week view is too cramped (7 narrow columns)
- **P0** No "Today" button on week view
- **P0** Drag-and-drop has no visual feedback during drag
- **P0** No conflict warning if dragging onto existing appointment
- **P1** No animation when appointment status changes
- **P2** No "color blindness" mode

#### Engineering
- **P0** `take: 500` appointments is unbounded — paginate by date range
- **P0** Drag-drop PATCH has no optimistic UI rollback on failure
- **P0** Date math uses `new Date()` (server time) instead of `business.timezone`
- **P1** Add index on `(businessId, startsAt)` — already exists ✓
- **P1** Add `serviceId` index for service filter

#### Validation
- **P0** No validation that new time is within business hours
- **P0** No validation that staff is available

---

### 6. `/campaigns`

**Purpose:** Create and manage marketing campaigns
**User:** Owner (weekly), manager

#### Existing
- Campaign list
- 4-step creator (type → message → audience → schedule)
- AI message generator
- 6 campaign types, 7 audience filters
- A/B test support
- Live stats

#### Missing (P0)
- ❌ **No campaign preview** with actual customer names
- ❌ **No character count** for WhatsApp (1024 char limit)
- ❌ **No template attachment** (must use pre-approved templates)
- ❌ **No "send to a few first" test mode**
- ❌ **No "duplicate" campaign** button
- ❌ **No campaign archive** (only delete)
- ❌ **No campaign performance chart** (sends/delivered/opens/clicks over time)

#### Missing (P1)
- ❌ No "campaign series" (multi-touch sequence)
- ❌ No Drip campaigns (Day 1, Day 3, Day 7)
- ❌ No UTM tracking for revenue attribution
- ❌ No campaign brief/notes for team

#### UX Issues
- **P0** AI generation only works if API keys set — no clear fallback
- **P0** No undo for "Send now" 
- **P0** Audience count shown AFTER create, not BEFORE
- **P1** Can't edit campaign after launch
- **P1** No campaign preview on WhatsApp mockup
- **P2** No campaign templates gallery

#### Engineering
- **P0** `sendWhatsAppMessage` in a loop without queue = will block on rate limits
- **P0** No job queue (BullMQ/Inngest) — just runs in API request
- **P0** No rate-limit detection ("Too many requests, retry in 5s")
- **P1** Audience count not cached
- **P1** No campaign-level error log

#### Compliance
- **P0** No consent verification (are these customers opted-in?)
- **P0** WhatsApp 24-hour window not enforced (can only send freeform within 24h of customer message)
- **P0** No NDNC registry check for India (TRAI regulation)

---

### 7. `/customers`

**Purpose:** Manage customer database
**User:** Owner, manager

#### Existing
- Customer list (500 max)
- Search, tag filter, view filters
- Bulk actions (tag, message, delete)
- Edit modal (full)
- CSV import + export
- Birthday/anniversary views

#### Missing (P0)
- ❌ **No duplicate detection** ("There are 2 Riya Sharmas")
- ❌ **No merge duplicates** flow
- ❌ **No customer timeline** (view all messages + appointments + orders)
- ❌ **No lifetime value** (LTV) calculation
- ❌ **No segment builder** (drag-drop filters)
- ❌ **No reactivation score** (who's about to churn)
- ❌ **No customer notes visible** on list

#### Missing (P1)
- ❌ No "Last contacted" column
- ❌ No customer source attribution
- ❌ No "next best action" suggestion
- ❌ No photo/avatar upload
- ❌ No "send WhatsApp" button per customer
- ❌ No "schedule appointment" inline

#### UX Issues
- **P0** 500-customer limit is hardcoded — no pagination
- **P0** Birthday display shows "in 7 days" but doesn't sort by upcoming
- **P0** Bulk delete has no undo
- **P1** Edit modal has no "view all appointments" link
- **P1** No keyboard navigation (J/K for up/down)
- **P2** No customer 360° sidebar view

#### Engineering
- **P0** `take: 500` is unbounded for production
- **P0** `prisma.customer.count` is N+1 on dashboard
- **P0** No soft-delete (GDPR "right to be forgotten" needs hard delete)
- **P1** No customer-level audit log
- **P1** No de-duplication by phone (relies on unique constraint)
- **P1** No data anonymization for inactive customers

#### Security
- **P0** PII (phone, email) shown in full
- **P0** No field-level encryption
- **P1** No "export my data" for individual customer
- **P1** No consent management

---

### 8. `/leads`

**Purpose:** Track lead sources and conversion
**User:** Owner (weekly review)

#### Existing
- 4 top stats (total, bookings, revenue, avg deal)
- Conversion funnel
- Source breakdown table
- Recent leads list

#### Missing (P0)
- ❌ **No date range selector** (only shows all-time)
- ❌ **No campaign attribution** (which campaign → which lead → which revenue)
- ❌ **No customer journey timeline**
- ❌ **No cohort analysis** (Jan signups vs Feb signups retention)
- ❌ **No LTV / CAC calculation**
- ❌ **No visualization** (just bars, no line/area charts)

#### Missing (P1)
- ❌ No UTM parameter tracking
- ❌ No "first touch / last touch" attribution
- ❌ No export to CSV
- ❌ No forecast ("based on this trend, expect X bookings next month")

#### UX Issues
- **P0** "wow" comparison hardcoded to 30d
- **P0** Source breakdown lacks clickable filter
- **P1** No "empty state" for new businesses
- **P1** No data refresh indicator

#### Engineering
- **P0** All-time queries are slow at scale — needs date-bucketed aggregation
- **P0** `Lead` doesn't have `source` enum — free text = dirty data
- **P1** No materialized daily stats table

---

### 9. `/approvals`

**Purpose:** Review AI-drafted campaigns before they send
**User:** Owner (multiple times/day)

#### Existing
- Pending list
- Bulk approve/reject
- Schedule/Edit/Approve
- Recently decided section

#### Missing (P0)
- ❌ **No draft preview in WhatsApp mockup** (only raw text)
- ❌ **No "auto-approve" rules** (despite the toggle in settings being non-functional)
- ❌ **No bulk action history**
- ❌ **No "send anyway with override"** for rejected items

#### Missing (P1)
- ❌ No approval delegation (manager can approve on owner's behalf)
- ❌ No approval expiration (auto-reject after 7 days)
- ❌ No "second pair of eyes" rule (require 2 approvals for sensitive content)
- ❌ No comment/thread per approval

#### UX Issues
- **P0** Edit button only opens `prompt()` — no proper editor
- **P0** No notification when new approval arrives
- **P1** No filtering (by type, by age)

#### Engineering
- **P0** No link to source campaign (if campaign is rejected, campaign isn't actually rejected)
- **P0** Approve flow doesn't re-validate the campaign
- **P1** No `Approval` → `Campaign` foreign key cascade

---

### 10. `/failures`

**Purpose:** Recover failed messages
**User:** Owner (when something breaks)

#### Existing
- Stats cards
- Failure cause breakdown
- Manual retry
- "Give up" button

#### Missing (P0)
- ❌ **No alert on dashboard when failures > threshold**
- ❌ **No auto-failover** (if Meta is down, try AiSensy)
- ❌ **No bulk retry with rate limiting** (manual retry-all could trigger 429)
- ❌ **No "investigate" link** (jump to conversation)
- ❌ **No customer notification** ("We tried to send, please check your phone")

#### Missing (P1)
- ❌ No failure trend chart
- ❌ No "is this a known issue?" integration (statuspage.io)
- ❌ No retry budget ("only retry X per day")

#### UX Issues
- **P0** "Give up" is permanent — no confirmation of impact ("X customers will never receive this")
- **P0** No "view original conversation" link
- **P1** No sorting (oldest first, most-attempted, etc.)

#### Engineering
- **P0** `processRetryQueue()` should check current rate limits before sending
- **P0** No idempotency — if retry button is double-clicked, sends twice
- **P0** Failed messages not cleaned up after 30 days
- **P1** No structured error categorization (network vs auth vs quota)

---

### 11-14. `/channels/*` (4 pages: whatsapp, voice, instagram, google)

**Purpose:** Channel-specific dashboards
**User:** Owner

#### WhatsApp Channel
- ❌ **No "send test message" button** (verify connection)
- ❌ **No webhook URL display** (for Meta setup)
- ❌ **No message template management** (link to /templates)
- ❌ **No per-conversation metrics**

#### Voice Channel
- ❌ **No "make a test call" button**
- ❌ **No call recording playback** (recordings stored but not viewable)
- ❌ **No transcript search**
- ❌ **No "block number"** option
- ❌ **No IVR menu configuration** (only flat calls)

#### Instagram Channel
- ❌ **No DM auto-reply rules**
- ❌ **No post scheduling calendar**
- ❌ **No hashtag suggestions**
- ❌ **No comment moderation queue**
- ❌ **Page is mostly aspirational** (no real integration)

#### Google Ads Channel
- ❌ **No keyword performance table**
- ❌ **No ad copy A/B test results**
- ❌ **No budget pacing chart**
- ❌ **No Quality Score visibility**
- ❌ **Page is mostly aspirational**

---

### 15. `/knowledge`

**Purpose:** Train the AI
**User:** Owner (one-time, then update as needed)

#### Existing
- 6 default sections
- Custom sections
- AI fill button
- Save to business.knowledge

#### Missing (P0)
- ❌ **No file upload** (FAQ PDFs, brochures, price lists)
- ❌ **No URL scraping** ("import from our website")
- ❌ **No version history** (lost forever if overwritten)
- ❌ **No "test what AI knows"** simulator
- ❌ **No source attribution** ("which section did the AI use for this answer?")

#### Missing (P1)
- ❌ No rich text editor (plain text only — can't bold, link, etc.)
- ❌ No images in knowledge (e.g., price list PDF)
- ❌ No structured data (services table, FAQs as Q&A)
- ❌ No multi-language knowledge (separate EN/HI versions)

#### UX Issues
- **P0** No preview of what AI would say with this knowledge
- **P0** "AI fill" can overwrite user content with no warning
- **P1** Character count is per-section, not total

#### Engineering
- **P0** `Business.knowledge` is a single TEXT field — no chunks for retrieval
- **P0** No RAG (retrieval-augmented generation) — just dumped into prompt
- **P0** Knowledge > 8k tokens will be truncated by AI
- **P1** No knowledge refresh after update (in-flight conversations still use old)
- **P1** No embedding-based semantic search

---

### 16. `/widget`

**Purpose:** Generate embed code for customer website
**User:** Owner (one-time setup)

#### Existing
- Color picker
- Button text
- Position selector
- Live preview
- Embed code generator

#### Missing (P0)
- ❌ **No multi-step form customization** (which fields to show: name, phone, email?)
- ❌ **No service selector** (which services to show?)
- ❌ **No "where to redirect after booking"** option
- ❌ **No analytics** (how many widget views, how many bookings)
- ❌ **Embed code doesn't include API key** — should validate domain

#### Missing (P1)
- ❌ No "thank you" page customization
- ❌ No branded widget (logo, colors)
- ❌ No "auto-fill if returning customer"
- ❌ No "smart slot suggestion" ("most customers book Tuesday 2 PM")

#### UX Issues
- **P0** Preview is a static mockup — should be the actual widget
- **P0** No way to test embed on a real page (Vercel preview URL?)
- **P1** No "I added the code" verification

#### Engineering
- **P0** `public/widget/embed.js` is server-rendered, not CDN-cached
- **P0** No CSP for embedded widget
- **P0** No domain whitelist (anyone can use the widget for any business)
- **P0** Widget doesn't gracefully degrade if JS fails
- **P0** `data-business-id` is exposed — no signature/HMAC

---

### 17. `/templates`

**Purpose:** Manage WhatsApp message templates
**User:** Owner (rare)

#### Existing
- 6 pre-built templates
- Edit form
- Variable preview
- A/B test button (no-op)

#### Missing (P0)
- ❌ **Templates are hardcoded** — not actually stored in DB or fetched from Meta
- ❌ **No template submission to Meta** for approval
- ❌ **No template status sync** (approved/pending/rejected in Meta)
- ❌ **No template analytics** (delivery rate, read rate)

#### Missing (P1)
- ❌ No rich media in templates (image, video, document)
- ❌ No quick reply buttons
- ❌ No call-to-action buttons
- ❌ No template categories
- ❌ No "create from conversation" (turn a good reply into a template)

#### UX Issues
- **P0** "Save" button shows success but doesn't actually save
- **P0** No template translation (EN/HI versions)
- **P0** A/B test button does nothing

#### Engineering
- **P0** Templates are inline JS arrays — not DB-stored
- **P0** No integration with Meta Template API
- **P0** Variables `{{1}}` are positional, not named — error-prone
- **P1** No template version history

---

### 18. `/settings`

**Purpose:** Configure everything
**User:** Owner (setup), manager (limited)

#### Existing (after v10)
- Business profile (with timezone, currency)
- 6 integrations (Connect/Disconnect)
- Team invites
- Notifications
- Security (password, 2FA)
- Automations toggles
- Data export
- Account pause/delete

#### Missing (P0)
- ❌ **Auto-approve rules are NOT enforced** (toggle exists but no logic)
- ❌ **No knowledge base link** (have /knowledge page but not linked here)
- ❌ **No payment method mgmt** (no Razorpay customer portal)
- ❌ **No "delete team member"** button (only invites can be cancelled)
- ❌ **No "transfer ownership"** flow

#### Missing (P1)
- ❌ No API key management (for Scale plan)
- ❌ No webhook configuration
- ❌ No custom domain (white-label)
- ❌ No GDPR data subject access request form
- ❌ No language preference per channel

#### UX Issues
- **P0** Page is very long — no anchor navigation
- **P0** "Save" buttons are scattered (per-section) — easy to miss
- **P0** No "unsaved changes" warning
- **P1** No keyboard navigation between sections

#### Engineering
- **P0** PUT `/api/settings` is a giant any-shape accepter — no validation
- **P0** `businessId` from session is the only authorization — no role check
- **P0** Integration POST has no transactional integrity (if env var check passes but DB write fails, partial state)
- **P1** No settings change audit log
- **P1** No "default settings" for new businesses

#### Security
- **P0** Only `session.user.email === business.ownerEmail` gates 2FA setup — should check role
- **P0** 2FA confirm endpoint has no rate limit (brute force the 6-digit code = 1M attempts possible)
- **P0** Export endpoint returns ALL data including soft-deleted records
- **P0** No DLP (PII redaction) in export

---

### 19. `/billing`

**Purpose:** Manage subscription
**User:** Owner

#### Existing
- Current plan display
- This month stats
- Failed payment alerts
- Invoice history table
- GST info

#### Missing (P0)
- ❌ **No actual payment** — links to /plans and /settings but no payment flow
- ❌ **No payment method mgmt** (no card update, no auto-pay toggle)
- ❌ **No "download all invoices" ZIP**
- ❌ **No prorated upgrade preview** ("$X charged today")
- ❌ **No usage-based billing breakdown** (per-service costs)

#### Missing (P1)
- ❌ No billing email preferences
- ❌ No "make this the primary contact" toggle
- ❌ No budget alerts ("you've used 80% of expected bookings")

#### UX Issues
- **P0** "Failed payment" alert doesn't link to retry
- **P0** "Next invoice: 1st of next month" is hardcoded — should be per-business
- **P1** No payment history beyond 24 invoices

#### Engineering
- **P0** No actual Razorpay subscription flow implemented
- **P0** `Invoice` model has no link to Razorpay invoice (just IDs)
- **P0** No webhook idempotency
- **P1** No tax calculation logic (only mock)

#### Compliance
- **P0** No GSTIN field (only placeholder)
- **P0** No "tax invoice" vs "bill of supply" distinction
- **P0** No HSN code validation
- **P1** No TDS handling

---

### 20. `/plans`

**Purpose:** Self-serve plan changes
**User:** Owner

#### Existing
- 3 plans (Starter/Growth/Scale)
- Feature comparison table
- Current plan badge
- Downgrade guard

#### Missing (P0)
- ❌ **No actual Razorpay plan switching** — API just updates DB
- ❌ **No prorated billing calculation**
- ❌ **No "add-ons"** (extra voice minutes, extra Instagram posts)
- ❌ **No annual discount toggle** (pay yearly save 20%)

#### Missing (P1)
- ❌ No "Compare all features" modal
- ❌ No "Talk to sales" CTA for Scale
- ❌ No testimonials per plan
- ❌ No "calculator" (estimate your bill)

#### UX Issues
- **P0** "Downgrade to Starter" doesn't warn about data loss
- **P0** "Most popular" badge doesn't track why it's popular
- **P1** No FAQ

#### Engineering
- **P0** `change-plan` API has no payment processor integration
- **P0** No idempotency — if button double-clicked, customer charged twice

---

### 21. `/admin` (Founder view)

**Purpose:** Cross-tenant metrics
**User:** Founder (you)

#### Existing
- MRR, ARR
- Business counts
- Recent businesses table
- Recent activity feed
- Health alerts

#### Missing (P0)
- ❌ **No login as customer** (impersonation)
- ❌ **No support ticket integration** (Intercom/Zendesk)
- ❌ **No business detail page** (click business to see their dashboard)
- ❌ **No churn analysis** (who churned when)
- ❌ **No revenue chart over time**

#### Missing (P1)
- ❌ No "send announcement" to all users
- ❌ No "feature flag" management
- ❌ No A/B test management
- ❌ No system health dashboard (DB, queue, error rates)

#### UX Issues
- **P0** "INTERNAL" badge isn't a real auth gate (anyone with `/admin` URL can see if `ADMIN_EMAIL` matches)
- **P0** No search across businesses

#### Engineering
- **P0** `getAdminStats()` is 16 separate queries — should be aggregated
- **P0** No row-level security (RLS) — should be on a separate admin DB
- **P0** No audit log for admin actions
- **P1** No rate limiting (could scrape all business data)

---

### 22. `/automation`

**Purpose:** View automation stats
**User:** Owner (weekly)

#### Existing
- 5 automation stats cards
- Automation card grid
- Upcoming birthdays
- Recent activity

#### Missing (P0)
- ❌ **No "Pause all automations"** master switch
- ❌ **No automation template gallery** ("30-day reactivation sequence")
- ❌ **No "what triggered this" debugging** ("why did this message go out?")
- ❌ **No automation calendar** ("when will the next review request go out?")
- ❌ **No per-customer automation history**

#### Missing (P1)
- ❌ No automation analytics (open rate, response rate)
- ❌ No "test mode" (send to your own number first)
- ❌ No automation comparisons (A/B message variants)

#### UX Issues
- **P0** "Set up" CTA for disabled automations — but no link to actual setup
- **P0** Recent activity has no filter
- **P1** No export

---

### 23. `/onboarding`

**Purpose:** First-time setup wizard
**User:** New owner

#### Existing
- 6-step wizard
- Persists to DB

#### Missing (P0)
- ❌ **No skip button** (some steps are blockers)
- ❌ **No "save and continue later"** (must complete in one session)
- ❌ **No progress persistence** (refresh = lose progress)
- ❌ **No contextual help** ("what's a WhatsApp BSP?")

#### Missing (P1)
- ❌ No "watch 2-min demo video" option
- ❌ No "schedule onboarding call" CTA
- ❌ No sample data ("try with 10 fake customers")

---

## Cross-Cutting Concerns (Affect ALL Pages)

### Authentication & Authorization
- **P0** Only NextAuth credentials — no OAuth providers wired
- **P0** No role-based access control (owner vs manager vs viewer) — schema has `role` but no enforcement
- **P0** Manager can do everything owner can (no permission gates)
- **P0** No session timeout (token expires in 30 days, no idle timeout)
- **P1** No "log out all devices" button
- **P1** No login from new device notification

### Audit Logging
- **P0** Activity log exists but no UI to view it
- **P0** No actor attribution for AI actions (all logged as "ai" or "system")
- **P0** No immutable audit trail (can be edited/deleted)
- **P1** No audit log export for compliance

### Monitoring & Observability
- **P0** No error tracking (Sentry/Honeybadger)
- **P0** No uptime monitoring
- **P0** No performance monitoring (APM)
- **P0** `console.log` everywhere — no structured logging
- **P1** No business metrics dashboard (PostHog/Mixpanel)
- **P1** No user feedback widget

### Data Retention
- **P0** No data retention policy (messages kept forever)
- **P0** No soft-delete for customers
- **P0** No PII encryption at rest
- **P1** No automated GDPR/CCPA deletion

### Notifications
- **P0** No email notification system (just `sendEmail` mock)
- **P0** No SMS notification system
- **P0** No in-app notification center
- **P0** No push notifications

### Performance
- **P0** No caching (Redis/Vercel KV)
- **P0** No image optimization (Next.js Image not used)
- **P0** No CDN for static assets
- **P0** N+1 queries throughout (e.g., dashboard, leads)
- **P0** No database connection pooling config

### Mobile Responsiveness
- **P0** Sidebar doesn't collapse to bottom-nav
- **P0** Tables overflow horizontally (customers, leads, billing)
- **P0** Calendar is unusable on mobile
- **P0** Inbox chat panel is broken on mobile
- **P0** No touch-friendly tap targets (min 44x44px)
- **P1** No swipe gestures

### Accessibility (WCAG 2.1 AA)
- **P0** No focus indicators on buttons/links
- **P0** Color contrast fails in some places (gray text on gray)
- **P0** No `aria-label` on icon-only buttons
- **P0** No keyboard navigation between tabs
- **P0** No `lang` attribute on translatable text
- **P0** Forms have no `<label>` (just placeholders)
- **P1** No screen reader testing done
- **P1** No skip-to-content link
- **P1** No high-contrast mode

### Internationalization
- **P0** UI is English-only (despite having `/lib/i18n.ts` with Hindi)
- **P0** No locale-aware date formatting
- **P0** No locale-aware currency formatting
- **P0** No RTL support (for Urdu/Arabic future)

### DevOps
- **P0** No CI/CD pipeline
- **P0** No staging environment
- **P0** No database migrations strategy (using `db push` = dangerous)
- **P0** No environment variable documentation
- **P0** No `Dockerfile` or deployment guide
- **P0** Secrets in `.env.example` as placeholders (good) but no validation on boot
- **P1** No feature flags
- **P1** No A/B test infrastructure
- **P1** No backup strategy

### Compliance
- **P0** No Terms of Service
- **P0** No Privacy Policy
- **P0** No Cookie Policy / consent banner
- **P0** No DPA (Data Processing Agreement) for enterprise
- **P0** No SOC 2 / ISO 27001 readiness
- **P0** No HIPAA consideration (dental/medical)
- **P1** No regional data residency

### Documentation
- **P0** No API documentation (no OpenAPI/Swagger)
- **P0** No user-facing help docs
- **P0** No developer setup guide
- **P0** No architecture diagram
- **P0** No troubleshooting runbook
- **P1** No CHANGELOG
- **P1** No versioned API

---

## Prioritized Backlog

### P0 — Must fix before first customer (5-10 days)

| # | Task | Estimate | Blocks |
|---|---|---|---|
| 1 | Add rate limiting to all public APIs | 0.5d | Spam attacks |
| 2 | Add Zod request validation to all POST routes | 1d | Security |
| 3 | Add error boundaries + loading skeletons | 0.5d | UX |
| 4 | Add environment variable validation (fail boot if missing in prod) | 0.5d | Operability |
| 5 | Add `forgot password` flow | 0.5d | Signup |
| 6 | Add `email verification` on signup | 1d | Auth |
| 7 | Add webhook signature verification (Razorpay, WhatsApp) | 0.5d | Security |
| 8 | Add `prisma migrate` setup (replace `db push`) | 0.5d | DB integrity |
| 9 | Add 2FA enforcement option | 0.5d | Security |
| 10 | Add role-based access control (manager/viewer) | 1d | Security |
| 11 | Add Sentry or equivalent error tracking | 0.5d | Operability |
| 12 | Add real landing page in Next.js (not just mockup) | 2d | Conversion |
| 13 | Mobile responsive sidebar (hamburger menu) | 1d | Mobile UX |
| 14 | Add Terms of Service + Privacy Policy | 0.5d | Legal |
| 15 | Add CSRF protection beyond NextAuth | 0.5d | Security |
| 16 | Add production launch checklist / deployment guide | 0.5d | Launch |

**Total: ~12 days of focused work**

### P1 — Important for first 100 customers (2-4 weeks)

| # | Task | Estimate |
|---|---|---|
| 17 | Build a real customer self-service portal (WhatsApp link) | 3d |
| 18 | Add multi-staff support | 4d |
| 19 | Add WebSocket for real-time inbox | 3d |
| 20 | Add NPS surveys | 1d |
| 21 | Add referral program | 3d |
| 22 | Add waitlist management | 2d |
| 23 | Add Stripe-equivalent (Razorpay) full integration | 3d |
| 24 | Add email notification preferences (per-event) | 2d |
| 25 | Add "what changed since last login" digest | 1d |
| 26 | Add in-app notification center | 2d |
| 27 | Add comprehensive audit log UI | 2d |
| 28 | Add CI/CD pipeline (GitHub Actions) | 1d |
| 29 | Add staging environment | 1d |
| 30 | Add Sentry error tracking integration | 0.5d |
| 31 | Add structured logging (pino/winston) | 0.5d |
| 32 | Add OpenAPI/Swagger documentation | 1d |
| 33 | Add UTM tracking for campaigns | 1d |
| 34 | Add duplicate customer detection | 1d |
| 35 | Add customer merge tool | 1d |
| 36 | Add conversation merge tool | 1d |
| 37 | Add "send test message" buttons | 0.5d |
| 38 | Add "what changed since yesterday" digest on dashboard | 1d |
| 39 | Add file upload to knowledge base | 1d |
| 40 | Add RAG (retrieval-augmented generation) for knowledge | 3d |
| 41 | Add HSN/GSTIN fields + validation to billing | 1d |
| 42 | Add invoice PDF customization | 1d |
| 43 | Add iCal feed for calendar | 0.5d |
| 44 | Add print stylesheets (day sheet, invoice, etc.) | 0.5d |
| 45 | Add "auto-approve" rules engine | 2d |
| 46 | Add approval expiration | 0.5d |
| 47 | Add retry budget for failed messages | 0.5d |
| 48 | Add widget analytics (views, clicks, conversions) | 2d |
| 49 | Add domain whitelist for widget | 0.5d |
| 50 | Add GDPR data export + deletion | 1d |
| 51 | Add accessibility (focus indicators, aria-labels, contrast) | 2d |
| 52 | Add i18n for UI (Hindi, English) | 2d |
| 53 | Add mobile bottom-nav for sidebar | 1d |
| 54 | Add mobile-friendly tables (cards on mobile) | 1d |
| 55 | Add keyboard shortcuts (Cmd+K, J/K) | 1d |
| 56 | Add `aria-live` for new messages | 0.5d |

### P2 — Nice to have for 1k+ customers (1-3 months)

| # | Task | Estimate |
|---|---|---|
| 57 | Build a PWA (installable) | 3d |
| 58 | Build native mobile app (React Native) | 14d |
| 59 | Add voice AI in 6 Indian languages | 7d |
| 60 | Add Instagram auto-posting (real) | 7d |
| 61 | Add Google Ads real integration | 5d |
| 62 | Add custom domain / white-label | 3d |
| 63 | Add API for third parties | 5d |
| 64 | Add webhooks for customer events | 3d |
| 65 | Add cohort analysis | 3d |
| 66 | Add LTV / CAC calculation | 2d |
| 67 | Add churn prediction ML | 5d |
| 68 | Add cross-sell suggestions | 4d |
| 69 | Add customer 360° view | 2d |
| 70 | Add "next best action" AI suggestions | 3d |
| 71 | Add campaign A/B test results | 3d |
| 72 | Add business intelligence dashboard | 5d |
| 73 | Add support ticket integration | 3d |
| 74 | Add SOC 2 Type I readiness | 30d |
| 75 | Add HIPAA compliance (if medical) | 30d |

---

## Acceptance Criteria for "Ship-Ready"

The app is ship-ready when ALL of these are true:

- [ ] All P0 items complete
- [ ] Lighthouse score ≥ 90 (all pages)
- [ ] WCAG 2.1 AA compliance (axe-core passes)
- [ ] All API endpoints have input validation
- [ ] All API endpoints have rate limiting
- [ ] All secrets are in env vars, validated on boot
- [ ] Error tracking is live
- [ ] Database migrations are versioned
- [ ] CI/CD runs on every PR
- [ ] Staging environment exists
- [ ] Terms of Service + Privacy Policy published
- [ ] At least 1 beta customer has used it for 7 days without data loss
- [ ] Backup strategy documented and tested
- [ ] On-call runbook exists

**Estimated time to ship-ready: 12-15 days of focused work** (mostly P0 items)

---

## How to Use This Document

1. **This week:** Tackle P0 #1-10 (security, auth, validation)
2. **Next week:** P0 #11-16 (observability, legal, mobile)
3. **Ongoing:** Pick P1 items as customers request them
4. **Quarterly:** Review P2 for strategic bets

Each item has enough context to be assigned to an engineer and completed without further clarification.
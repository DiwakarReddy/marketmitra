# MarketMitra — Production Deployment Guide

**Target stack:** Vercel + Neon + Upstash
**Cost at 0-100 customers:** $0-5/mo
**Time to deploy:** ~30 minutes (excluding account creation)

---

## Prerequisites (5 minutes)

1. **GitHub account** — push your code here
2. **Vercel account** — https://vercel.com/signup (free, sign up with GitHub)
3. **Neon account** — https://neon.tech/signup (free Postgres, 0.5GB)
4. **Domain** (optional) — buy on Namecheap/GoDaddy/Cloudflare ($10/yr)

---

## Step 1: Set up Neon Postgres (3 minutes)

1. Go to https://console.neon.tech → create a new project
   - Region: **AWS Asia Pacific (Mumbai) — ap-south-1** (closest to India customers)
   - Postgres version: 16
   - Project name: `marketmitra-prod`
2. Copy the **pooled connection string** from the dashboard:
   ```
   postgresql://USER:PASS@ep-xxx-pooler.ap-south-1.aws.neon.tech/marketmitra?sslmode=require
   ```
   (The one with `-pooler` in the hostname is the pooled version — use this.)
3. Save this string as `DATABASE_URL` (you'll paste into Vercel next)

**Optional:** Create a separate `marketmitra-dev` branch in Neon for local development.

---

## Step 2: Generate secrets (1 minute)

```bash
# Three secrets you need:
NEXTAUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)        # exactly 64 hex chars
CRON_SECRET=$(openssl rand -hex 32)

# Save these somewhere safe (1Password, Bitwarden, etc.)
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "CRON_SECRET=$CRON_SECRET"
```

---

## Step 3: Push to GitHub (3 minutes)

```bash
cd marketmitra
git init
git add .
git commit -m "MarketMitra v13.1 - production ready"

# Create a PRIVATE repo on GitHub first, then:
git remote add origin git@github.com:YOUR_ORG/marketmitra.git
git branch -M main
git push -u origin main
```

⚠️ **Important:** Make sure `.env` is in `.gitignore`. We never commit secrets.

---

## Step 4: Deploy to Vercel (5 minutes)

1. Go to https://vercel.com/new
2. Import your `marketmitra` repository
3. Vercel auto-detects Next.js. Click **Deploy** (it'll fail first time — env vars not set yet)
4. Go to **Project Settings → Environment Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://USER:PASS@ep-xxx-pooler...` | From Step 1 |
| `USE_NEON_ADAPTER` | `true` | Required for serverless |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Update later if you add custom domain |
| `NEXTAUTH_SECRET` | (from Step 2) | Required |
| `ENCRYPTION_KEY` | (from Step 2) | Required, 64 chars |
| `CRON_SECRET` | (from Step 2) | Required for cron |
| `ADMIN_EMAIL` | `you@yourdomain.com` | For /admin access |
| `GOOGLE_API_KEY` | (from aistudio.google.com) | Free Gemini API |
| `WHATSAPP_PROVIDER` | `meta` | Or leave blank for mock mode |
| `WHATSAPP_ACCESS_TOKEN` | (from Meta Business) | When ready |
| `WHATSAPP_PHONE_NUMBER_ID` | (from Meta Business) | When ready |

5. Add the same variables for **Production**, **Preview**, and **Development** environments (or use different DBs for each)
6. Click **Deploy** again → wait for build (~3 minutes)

---

## Step 5: Run database migrations (2 minutes)

After first successful deploy:

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Pull env vars locally: `vercel env pull .env.production`
4. Apply migrations to your Neon DB:
   ```bash
   DATABASE_URL="<your-neon-pooled-url>" npx prisma migrate deploy
   ```
5. Seed demo data (optional, for demos):
   ```bash
   DATABASE_URL="<your-neon-pooled-url>" npm run db:demo
   ```

---

## Step 6: Set up custom domain (5 minutes, optional)

1. Buy a domain (e.g. `app.marketmitra.com`)
2. In Vercel: **Project Settings → Domains → Add** → enter your domain
3. Vercel gives you DNS records to add at your registrar:
   - For apex (`marketmitra.com`): A record → `76.76.21.21`
   - For subdomain (`app.marketmitra.com`): CNAME → `cname.vercel-dns.com`
4. Wait 5-30 min for DNS propagation
5. SSL certificate is automatic

Update `NEXTAUTH_URL` to your new domain and redeploy.

---

## Step 7: Configure Meta WhatsApp Business (when ready)

This step is optional for demos (you can use mock mode initially).

1. Go to https://business.facebook.com → create a Meta Business account
2. Create a **WhatsApp Business App** at https://developers.facebook.com/apps
3. Add the **WhatsApp** product to your app
4. In WhatsApp → **API Setup**, you'll get:
   - Phone Number ID
   - Permanent Access Token (generate from System Users)
5. In your MarketMitra dashboard → **Settings → Integrations → WhatsApp**, paste these
6. In Meta App Dashboard → **WhatsApp → Configuration → Webhook**:
   - URL: `https://yourdomain.com/api/whatsapp/webhook`
   - Verify Token: any random string (paste same in MarketMitra)
   - Subscribe to: `messages`, `message_status`

For production at scale: submit WhatsApp message templates for approval at Meta Business Manager → WhatsApp → Message Templates.

---

## Step 8: Verify everything works (5 minutes)

Test the deployment:

```bash
# 1. Health check (should return 200)
curl https://yourdomain.com/api/health

# 2. Login as demo user
# Visit https://yourdomain.com/login
# Use priya@smilecare.demo / demo1234

# 3. Test webhook (if Meta configured)
curl -X GET "https://yourdomain.com/api/webhook/your-business-id/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"

# 4. Test cron (should return ok)
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/daily
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/tick
```

### Per-minute scheduler (Vercel Hobby fix)

Vercel Hobby caps cron at **once per day** — too slow for drips, no-show
scoring, retry queue, confirmation requests, etc. Two options:

**Option A — Vercel Pro ($20/mo):** add `"schedule": "* * * * *"` back to
`vercel.json` under `/api/cron/tick` and delete `.github/workflows/cron-tick.yml`.

**Option B — Stay on Hobby (default):** GitHub Actions cron drives the
per-minute tick. Already wired up at `.github/workflows/cron-tick.yml`.
You just need two GitHub repo secrets:

| Secret      | Value                                                    |
| ----------- | -------------------------------------------------------- |
| `CRON_URL`  | `https://yourdomain.com/api/cron/tick`                   |
| `CRON_SECRET` | the same value you set as `CRON_SECRET` on Vercel      |

The endpoint has an `inFlight` claim guard, so even if both Vercel daily
cron and GitHub Actions fire, no work is duplicated.

---

## Step 9: Set up monitoring (10 minutes)

### Uptime monitoring (free)
- Go to https://betterstack.com → create free account
- Add monitor: `https://yourdomain.com/api/health`
- Alert via email/Slack when down

### Error tracking (free tier)
- Go to https://sentry.io → create account
- Create Next.js project
- Add `SENTRY_DSN` env var to Vercel
- (We can wire this in next iteration — for now, Vercel logs work fine)

---

## Ongoing operations

### Daily backups
- Neon free tier: 7-day automated backups (daily)
- Upgrade to Neon Pro ($19/mo) for 30-day retention

### Cost monitoring
- Check Vercel dashboard weekly: https://vercel.com/dashboard
- Check Neon dashboard for DB size
- Set Vercel spend limit: Project → Settings → Usage → Set Budget Alert

### Viewing logs
- Vercel: https://vercel.com/your-project/logs
- Real-time logs in dev: `vercel logs --follow`

---

## Cost summary

| Scale | Vercel | Neon | AI (Gemini) | WhatsApp | Total/mo |
|---|---|---|---|---|---|
| **0-100 customers** | Free | Free | $0-2 | $0 (free tier 1000 convos) | **$0-5** |
| **100-1000** | $20 (Pro) | Free | $5-15 | $0-20 | **$25-50** |
| **1000-10000** | $20-100 | $19 | $30-100 | $50-200 | **$150-400** |
| **10000+** | Custom | Custom | Custom | Custom | Negotiate |

---

## Troubleshooting

**Build fails with "Cannot find module @prisma/client"**
→ Make sure `DATABASE_URL` env var is set in Vercel before first build

**Webhook returns 401 "Invalid signature"**
→ Check `WHATSAPP_APP_SECRET` matches the one in Meta App Dashboard

**Database connection timeout**
→ Make sure you're using the **pooled** connection string (has `-pooler` in hostname)

**Cron not running**
→ Check `vercel.json` is at repo root; check Vercel dashboard → Crons tab

**AI replies are slow (>5 sec)**
→ Switch from `gemini-1.5-flash` to nothing and let it use OpenAI (or vice versa)

---

## Next steps after launch

1. Set up real Meta WhatsApp Business account
2. Add Sentry for error tracking
3. Set up Backups export (Neon Pro or pg_dump cron)
4. Configure custom email sender (Resend)
5. Add your first 10 paying customers
6. Build the dental clinic vertical wedge (next sprint)

---

Questions? File an issue or ping the team.
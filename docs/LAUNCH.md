# ACT VII — Launch guide

Everything needed to take the store from this repository to a live site on
Vercel + Supabase. Do the steps in order. Never paste secrets into chat or
commit them; they belong in `.env.local` (local) and in Vercel's settings.

## 1. Accounts you need

| Service | Used for | Plan notes |
|---|---|---|
| GitHub | Code (already at `nirajhimself/ActSeven`) | — |
| Vercel | Hosting | Hobby works; Pro needed for the cron job to run every 15 min (Hobby: once a day) and for commercial use under Vercel's terms |
| Supabase | Postgres database | Free tier has **no automatic backups** — see step 9 |
| Razorpay | Online payments | Test mode works immediately; live mode needs KYC |
| Resend | Order emails and sign-in codes | Needs a domain you control |

## 2. Database (Supabase)

The current project is in **Sydney**, ~400 ms from India per query. Before
launch, create a new project in **South Asia (Mumbai) — ap-south-1**; it only
holds the sample catalogue and test orders so far.

1. Supabase → **New project** → region **Mumbai**. Save the database password.
2. **Connect** → copy:
   - **Transaction pooler** (port **6543**) → `DATABASE_URL`
   - **Session pooler** (port **5432**) → `DIRECT_URL` (used only for migrations)
3. Put both in `.env.local`, then create the tables:
   ```powershell
   npm run db:migrate
   ```
4. Catalogue: either add your real products in **/admin → Products**, or load
   the sample catalogue to start from (development data — replace before launch):
   ```powershell
   $env:SEED_ALLOW_REMOTE="1"; npm run db:seed; Remove-Item Env:SEED_ALLOW_REMOTE
   ```
   The seed never overwrites existing products, prices or stock.

## 3. Deploy to Vercel

1. Vercel → **Add New → Project** → import `nirajhimself/ActSeven`.
2. Framework: Next.js (detected). Leave build settings as they are — Vercel
   runs `npm run vercel-build`, which applies migrations on **production**
   deploys only, then builds. The region (`bom1`, Mumbai) and the cron job
   come from `vercel.json`.
3. **Environment variables** (Project → Settings → Environment Variables).
   Add each for **Production**; see step 3a for Preview.

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase transaction pooler (6543) |
   | `DIRECT_URL` | Supabase session pooler (5432) |
   | `AUTH_SECRET` | 32+ random characters (generate a new one for production) |
   | `ADMIN_USER` | e.g. `admin` |
   | `ADMIN_PASSWORD` | 16+ characters, unique |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain` (no trailing slash) |
   | `CRON_SECRET` | 16+ random characters |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Test keys first (step 5) |
   | `RAZORPAY_WEBHOOK_SECRET` | From step 5 |
   | `RESEND_API_KEY` / `EMAIL_FROM` | From step 6 |

   Generate random secrets (cryptographically secure) in PowerShell:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(33).toString('base64url'))"
   ```

   **3a. Preview deployments** (every pushed branch) must not use the live
   database: give Preview its own `DATABASE_URL`/`DIRECT_URL` (a second
   Supabase project), or turn previews off (Settings → Git). Preview deploys
   never run migrations.
4. **Deploy.** Then open `https://<your-deployment>/api/health` — it should
   say `"status":"ok"`. If it says `degraded`, sign in to `/admin`: the
   overview lists exactly which setting needs attention.

## 4. Domain

Vercel → Project → **Domains** → add your domain and follow the DNS steps.
Set `NEXT_PUBLIC_SITE_URL` to the final `https://` address and redeploy
(it's used in emails, the sitemap and SEO tags).

## 5. Payments (Razorpay) — test mode first

1. Razorpay dashboard → **Test Mode** → Account & Settings → **API Keys** →
   generate. Set `RAZORPAY_KEY_ID` (`rzp_test_…`) and `RAZORPAY_KEY_SECRET`.
2. Settings → **Payment capture**: automatic capture on.
3. Settings → **Webhooks** → add `https://your-domain/api/razorpay/webhook`
   with events: `payment.captured`, `order.paid`, `payment.failed`,
   `refund.created`, `refund.processed`, `refund.failed`. Choose a secret and
   set it as `RAZORPAY_WEBHOOK_SECRET`. Redeploy.
4. Place a test order with Razorpay's test card/UPI. Check in **/admin**:
   the order is **Paid**, and **Payment notifications** shows
   `payment.captured · processed`. Cancel it to test a refund.
5. While paying, open the browser console: if there are **no**
   `[Report Only] … Content Security Policy` messages, enforce the full policy
   by renaming `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy` in `next.config.ts` (and dropping the separate
   minimal policy). If there are messages, add the reported Razorpay domain
   to the matching directive first.
6. Go live only after KYC: swap in `rzp_live_…` keys and a live-mode webhook.
   The admin badge switches from **TEST mode** to **LIVE**.

## 6. Email (Resend)

Resend → add and verify your domain (DNS records) → create an API key. Set
`RESEND_API_KEY` and `EMAIL_FROM` (e.g. `ACT VII <orders@your-domain>`).
Without email, customers can't receive sign-in codes and no order emails are
sent.

## 7. Admin

Sign in at `https://your-domain/admin/login`. Five wrong passwords from one
address lock it out for 15 minutes. Every change is recorded under
**Overview → Recent admin activity**.

## 8. Scheduled job

`vercel.json` runs `/api/cron/expire-orders` daily (02:00 IST), releasing
stock held by unpaid online orders older than 30 minutes; checkout and the
admin also do this as they go. On Vercel Pro, change the schedule to
`*/15 * * * *`. Requires `CRON_SECRET` (Vercel sends it automatically).

## 9. Monitoring and backups

- **Uptime:** point a monitor (e.g. UptimeRobot, Better Stack) at
  `/api/health`; it returns **503** when the database is unreachable or a
  required setting is wrong.
- **Errors:** Vercel → Logs. Server errors are one JSON line each — search
  `"level":"error"`. Configuration problems at start-up are logged as
  `[config] ERROR …`.
- **Backups:** Supabase Pro includes daily backups (and optional
  point-in-time recovery). On the free plan, take your own before launch and
  regularly after, e.g. with the Supabase CLI:
  ```powershell
  npx supabase db dump --db-url "<DIRECT_URL>" -f backup.sql
  ```
  Store backups somewhere private — they contain customer data.

## 10. Rolling back

Vercel → Deployments → previous deployment → **Promote to Production**.
Database migrations in this project only add tables and columns, so older
code keeps working against a newer database.

## 11. Go-live checklist

- [ ] Database in Mumbai; `npm run db:migrate` done; backup taken
- [ ] Real products, photos, prices and stock entered in /admin (sample data removed or archived)
- [ ] Placeholder policies confirmed in `lib/site.ts`: free-shipping threshold, shipping fee, COD limit and fee, 15-day returns
- [ ] Help pages (shipping, returns, privacy, terms, contact) replaced with reviewed copy and real contact details
- [ ] All environment variables set for Production; Preview uses a separate database or is off
- [ ] `/api/health` returns `ok`; admin overview shows no **Fix** items
- [ ] Test COD order placed, shipped, delivered and returned in /admin
- [ ] Razorpay test payment, webhook and refund verified; CSP enforced (step 5.5)
- [ ] Emails received: sign-in code, order confirmation, shipping, refund
- [ ] Custom domain on https; `NEXT_PUBLIC_SITE_URL` matches
- [ ] Sitemap submitted in Google Search Console (`/sitemap.xml`)
- [ ] Uptime monitor on `/api/health`
- [ ] Live Razorpay keys and live webhook (after KYC)

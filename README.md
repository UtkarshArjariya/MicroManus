# MicroManus

MicroManus is a usage-based deep-research AI agent web app. This first build includes the deployable Next.js 15 skeleton, Supabase OAuth auth, a credit wallet, coupon unlock, Stripe Checkout unlock, and a protected app shell. Chat, BYOK model keys, agent tools, and PDF reports come later.

The platform never stores a platform-owned LLM provider key. Later BYOK keys should be user-supplied and encrypted with `ENCRYPTION_KEY`.

## Tech Stack

- Next.js 15 App Router, TypeScript, Tailwind CSS
- shadcn/ui-style local components
- Supabase Auth, Postgres, RLS, Storage-ready project structure
- Stripe Checkout one-time payments
- pnpm
- Vercel deployment

## Environment Variables

Copy `.env.example` to `.env.local` for local development and set the same values in Vercel:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
ENCRYPTION_KEY=
```

For production, `NEXT_PUBLIC_SITE_URL` must be your real `https://*.vercel.app` or custom domain with no trailing slash.

## Manual Setup Order

1. Create a Supabase project.
2. In Supabase SQL Editor or via Supabase CLI, run `supabase/migrations/20260718000000_initial_schema.sql`.
3. In Supabase Auth Providers, enable only Google and GitHub. Leave email/password and magic link disabled.
4. Create a Google OAuth app:
   - Authorized JavaScript origin: `https://<your-supabase-project-ref>.supabase.co`
   - Authorized redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - Paste the client ID and secret into Supabase's Google provider settings.
5. Create a GitHub OAuth app:
   - Homepage URL: `https://<your-production-domain>`
   - Authorization callback URL: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
   - Paste the client ID and secret into Supabase's GitHub provider settings.
6. In Supabase Auth URL Configuration, set:
   - Site URL: `https://<your-production-domain>`
   - Redirect URLs:
     - `http://localhost:3000/auth/callback`
     - `https://<your-production-domain>/auth/callback`
7. Create a Stripe test-mode product named `MicroManus Credits`.
8. Add a recurring-disabled one-time price for `$5.00 USD`. Copy the Price ID into `STRIPE_PRICE_ID`.
9. Get Stripe API keys from Developers > API keys:
   - Publishable key -> `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key -> `STRIPE_SECRET_KEY`
10. Create the webhook endpoint:
    - Local Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
    - Production dashboard endpoint: `https://<your-production-domain>/api/stripe/webhook`
    - Listen for `checkout.session.completed`
    - Copy the signing secret into `STRIPE_WEBHOOK_SECRET`
11. Generate `ENCRYPTION_KEY` for later BYOK storage:
    - `openssl rand -base64 32`
12. Add all env vars to `.env.local` and to Vercel Project Settings > Environment Variables.
13. Install and run locally:
    - `pnpm install`
    - `pnpm dev`
14. Deploy on Vercel:
    - Connect the GitHub repo in Vercel, or run `vercel deploy`
    - Use the included `vercel.json` defaults.

## Stripe Testing

Use Stripe test card `4242 4242 4242 4242` with any future expiration date, any CVC, and any ZIP/postal code.

After Checkout redirects to `/paywall?stripe=success`, the page polls `/api/wallet` because Stripe webhooks can lag by a few seconds. Once the webhook records the payment, the user is redirected to `/app`.

## Auth and Paywall Flow

- Users sign in only through Supabase Google or GitHub OAuth.
- `auth.users` inserts trigger `public.handle_new_user()`, which creates:
  - `profiles`
  - `credit_wallets` with balance `0`
- Middleware protects app pages and redirects authenticated users with `balance <= 0` to `/paywall`.
- `/paywall` offers exactly two unlock paths:
  - Coupon `SID_DRDROID`, case-insensitive and whitespace-trimmed, grants 5 credits once per user.
  - Stripe Checkout, $5 one-time payment, grants 5 credits through an idempotent webhook.

## Database Summary

Tables:

- `profiles`: one row per `auth.users` user.
- `credit_wallets`: one wallet per user, cached integer balance.
- `credit_ledger`: append-only audit log for credit deltas.
- `coupon_redemptions`: coupon audit with `unique(user_id, code)`.
- `stripe_payments`: Stripe Checkout payment audit with unique `stripe_session_id`.

Credit functions:

- `apply_credit(...)`: inserts a ledger row and updates the wallet atomically.
- `redeem_coupon_credit(...)`: blocks users who already redeemed any coupon, records redemption, grants 5 credits.
- `grant_stripe_purchase_credit(...)`: records Stripe payment and grants 5 credits once per Checkout Session.

RLS:

- Authenticated users can select only their own rows.
- Users can update only their own profile.
- Wallet, ledger, coupon, and payment writes are performed server-side with the Supabase service role.

## File Layout

```text
app/
  api/stripe/create-checkout-session/route.ts
  api/stripe/webhook/route.ts
  api/wallet/route.ts
  app/page.tsx
  auth/callback/route.ts
  login/
  paywall/
components/ui/
lib/
  credits.ts
  env.ts
  stripe.ts
  supabase/
middleware.ts
supabase/migrations/
```

## GitHub and Vercel

Initialize and push the repo:

```bash
git init
git add .
git commit -m "Initial MicroManus scaffold"
git branch -M main
git remote add origin git@github.com:<your-user-or-org>/micromanus.git
git push -u origin main
```

Then import that repo in Vercel, paste the environment variables, and deploy.

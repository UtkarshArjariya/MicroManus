# MicroManus

MicroManus is a usage-based deep-research agent workspace. A reviewer signs in with Google or GitHub, unlocks credits, adds their own LLM API key, and runs research chats that show the think -> act -> observe trace, web searches, source reads, final answers, downloadable PDF reports, and a stats dashboard with provider token/cost accounting.

Production signup URL: https://micromanus-drdroid.vercel.app/login

## What Is Built

- Supabase OAuth auth with Google and GitHub.
- Server-enforced paywall and credit wallet.
- Launch coupon `SID_DRDROID`, case-insensitive and whitespace-trimmed, grants 5 credits once per user.
- Stripe Checkout test payment grants 5 credits through an idempotent signed webhook.
- Bring-your-own-key provider settings with built-in endpoints for OpenAI, Anthropic/Claude, Google Gemini, and Kimi.
- Custom provider endpoints can use OpenAI Chat Completions, Anthropic Messages, or Google Gemini `generateContent` compatibility.
- Provider and new-chat model pickers can load the complete model catalog available to the supplied key; manual model IDs remain supported for private or newly released models.
- Encrypted BYOK storage. Keys are decrypted only in server code immediately before provider calls.
- Chat threads with a multi-step agent loop using `web_search`, `fetch_page`, and `generate_pdf_report`.
- Prompt caching hooks and cached-token extraction for OpenAI/Kimi/Anthropic-compatible usage payloads.
- Per-call token usage and real USD cost accounting in `usage_events`.
- One credit debited per completed assistant turn.
- Private Supabase Storage PDF artifacts with short-lived signed download URLs.
- `/app/stats` dashboard with costs, credits, provider/model summary, chat table, and turn breakdown.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS.
- Supabase Auth, Postgres, RLS, and private Storage.
- Stripe Checkout and webhook fulfillment.
- User LLM calls go directly from server routes to the selected provider using the user's encrypted BYOK key.
- Brave Search is the only platform-level external API key; it is used server-side inside the agent tool loop and guarded by per-turn limits.

## Environment Variables

Set these locally in `.env.local` and in Vercel Project Settings. Do not commit real values.

```bash
NEXT_PUBLIC_SITE_URL=https://micromanus-drdroid.vercel.app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_INR=
ENCRYPTION_KEY=
BRAVE_SEARCH_API_KEY=
```

Where to get them:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: Supabase project settings -> API.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`: Stripe Developers -> API keys, in test mode for review.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook endpoint signing secret for `/api/stripe/webhook`.
- `STRIPE_PRICE_ID_INR`: one-time ₹399 INR Stripe test-mode price for the 5-credit package.
- `ENCRYPTION_KEY`: generate with `openssl rand -base64 32`.
- `BRAVE_SEARCH_API_KEY`: Brave Search API dashboard.

## OAuth Redirects

Supabase Auth URL Configuration:

- Site URL: `https://micromanus-drdroid.vercel.app`
- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://micromanus-drdroid.vercel.app/auth/callback`

Google OAuth app:

- Authorized JavaScript origin: `https://<supabase-project-ref>.supabase.co`
- Authorized redirect URI: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

GitHub OAuth app:

- Homepage URL: `https://micromanus-drdroid.vercel.app`
- Authorization callback URL: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`

## Database Setup

Run migrations in order:

```text
supabase/migrations/20260718000000_initial_schema.sql
supabase/migrations/20260718001000_agent_chat_schema.sql
supabase/migrations/20260718002000_report_artifacts.sql
supabase/migrations/20260718003000_usage_costs_and_credit_billing.sql
supabase/migrations/20260718162000_cli_access_probe.sql
supabase/migrations/20260718180000_provider_api_formats.sql
```

Apply migrations with the project-local CLI rather than pasting SQL into the Dashboard:

```bash
pnpm supabase link --project-ref <project-ref>
pnpm supabase db push
```

Keep the Supabase personal access token and any database password in session environment variables or ignored local files only.

Core tables:

- Prompt 1: `profiles`, `credit_wallets`, `credit_ledger`, `coupon_redemptions`, `stripe_payments`.
- Prompt 2: `provider_keys`, `chats`, `messages`, `agent_steps`, `usage_events`.
- Prompt 3: `report_artifacts`, private Storage bucket `report-artifacts`, `agent_steps.type = artifact`.
- Prompt 4: usage cost columns on `usage_events` and unique `credit_ledger_agent_turn_reference_unique`.
- Operations: `20260718162000_cli_access_probe.sql` records verified CLI migration access without changing application schema.
- Provider compatibility: `api_format` separates the provider identity from its OpenAI-, Anthropic-, or Google-compatible wire protocol.

RLS:

- Authenticated users can select only their own rows.
- `provider_keys.encrypted_key` is excluded from authenticated select grants.
- Wallet/ledger/coupon/payment writes happen through service-role RPCs.
- `supabase/rls_qa_queries.sql` contains quick impersonation queries for two test users.

## Stripe Testing

- India test Visa: `4000 0035 6000 0008`
- Expiry: any future date
- CVC: any 3 digits
- ZIP/postal code: any value

The connected Stripe account is India-registered, so international-issued test cards such as `4242 4242 4242 4242` are correctly blocked; use the India-specific card above to test Checkout successfully.

Standalone checkout success returns to `/paywall?stripe=success`, then polls `/api/wallet` until the signed webhook records that exact Checkout session and grants credits. Billing opened inside the authenticated app supplies an app-local `returnTo`, so Stripe success and cancellation return to the same page with the Billing settings modal preserved. Coupon redemption uses the same validated destination. Only origin-relative paths under `/app` are accepted.

Indian Stripe accounts cannot create USD Checkout Sessions without cross-border export approval. MicroManus therefore prices the unlock at ₹399, a domestic-currency equivalent of the original $5 package; domestic INR pay-to-unlock and its five-credit grant are unchanged, while international cards still require the account’s export approval.

## Five-Minute Reviewer Walkthrough

1. Open https://micromanus-drdroid.vercel.app/login in a fresh browser session.
2. Sign in with Google or GitHub.
3. On `/paywall`, redeem coupon `SID_DRDROID` to get 5 credits. For the card path, use Stripe's India test Visa `4000 0035 6000 0008`.
4. Open Settings, add an OpenAI, Anthropic, Kimi, or compatible API key, then use Test connection.
5. Create a new chat with the saved key and model.
6. Ask for a current California wildfires report with sources and a PDF.
7. Confirm the visible trace shows distinct searches, page reads, report generation, a cited final answer, and a downloadable PDF with sources.
8. Ask a follow-up in the same chat, such as "how many sources did you use?", and confirm it uses prior context.
9. Start a second chat with a different model and confirm it has no context from the first chat.
10. Open Stats and check token usage, cached tokens, cost breakdown, credit debits, and remaining credits.
11. Use credits down to 0 or adjust the wallet during QA, confirm sending is blocked and the paywall unlock path restores access.
12. Sign out and back in, then confirm chats, key metadata, credits, reports, and stats persisted.

## Local Development

```bash
pnpm install
pnpm lint
pnpm build
pnpm dev
```

The app expects applied Supabase migrations, working OAuth providers, Stripe test-mode configuration, Brave Search, Supabase Storage, and at least one user-supplied LLM API key for full end-to-end testing.

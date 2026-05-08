# Session 4 — Multi-Tenant + Onboarding Polish

Magic-link login, no-overwrite onboarding, brand-neutral defaults, and a sign-out menu. Everything below is what's needed to ship the existing six-person waitlist.

## What changed

**New files**
- `migrations/0004_login_tokens.sql` — schema for the magic-link token table
- `packages/dashboard/api/login-request.js` — generates a token and emails a sign-in link via SendGrid
- `packages/dashboard/api/login-verify.js` — verifies a token, marks it used, returns the email
- `packages/dashboard/src/components/Login.jsx` — magic-link UI (enter email → check inbox → auto-verify)
- `packages/dashboard/src/components/AccountMenu.jsx` — small avatar dropdown with sign-out

**Modified files**
- `packages/dashboard/src/App.jsx` — three-way gate: Login → Onboarding → Dashboard
- `packages/dashboard/src/context/SettingsContext.jsx` — split `registerUser` into `setSession` + `completeOnboarding`. Fixes the silent overwrite bug where re-onboarding wiped Gmail tokens.
- `packages/dashboard/src/components/Onboarding.jsx` — pulls email from session (no more asking twice), brand-neutral default SKU (`SKU-001`, no preset 4.7oz/10), "not you?" sign-out, calls `completeOnboarding` instead of `registerUser`
- `packages/dashboard/src/components/Dashboard.jsx` — AccountMenu in header, dropped the `BYTE'M Brownies` brand fallback
- `packages/dashboard/src/components/Connections.jsx` — AccountMenu in header
- `packages/dashboard/api/draft-emails.js` — dropped the `Jack at BYTE'M` fallback that would have signed every other user's emails as you

## Setup steps

### 1. Run the migration

In the Supabase SQL Editor, paste the contents of `migrations/0004_login_tokens.sql` and run. It creates `bytem_login_tokens` and two indexes. Idempotent — safe to re-run.

### 2. Confirm Vercel env vars

Already-set ones the new code reuses: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SENDGRID_API_KEY`, `FROM_EMAIL`, `NEXT_PUBLIC_BASE_URL`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`.

No new env vars required.

Double-check `FROM_EMAIL` is a verified sender in SendGrid — the magic-link emails will look spammy if it's not. If you want them to come from `noreply@bytem.com` or similar, verify that domain in SendGrid first.

### 3. Deploy

```
cd packages/dashboard
vercel --prod
```

Or push to main if auto-deploy is wired.

### 4. Smoke test (5 minutes)

- [ ] Open the deployed URL in an incognito window. You should land on the Login screen, not a dashboard.
- [ ] Enter `jack+test1@browniibytes.com`. Confirm the "check your inbox" screen appears.
- [ ] Open the email, click the link. You should be auto-signed-in and routed to the Onboarding wizard.
- [ ] Fill in name + company. Skip the rest. Click "Open dashboard".
- [ ] You should land on the dashboard.
- [ ] Open the avatar dropdown (top right) → Sign out. You should land back on Login.
- [ ] Sign in again with the same email. You should skip onboarding and land directly on the dashboard with your data intact.
- [ ] In a separate browser/incognito, sign in with a different email (e.g. `jack+test2@browniibytes.com`). Verify your test1 data is NOT visible — completely separate workspace.
- [ ] Bonus: in the test1 account, connect Gmail. Then sign out. Sign back in. Confirm Gmail is still connected (this is the regression test for the overwrite bug).

### 5. Once smoke test passes — invite the waitlist

The six warm prospects: Jon, Morgan, Eli (Absurd Snacks), Zoë (Bim Bam Boo), Jesse Koltes, Erin. They each just need the URL — they enter their own email and onboard themselves. No more hand-holding required.

For Jon specifically, given the 5-week gap, lead with an apology and a one-tap link rather than just dropping the URL cold.

## Known gaps (not in scope for Session 4)

- **No rate limiting** on `/api/login-request`. Fine for 6 beta users; harden before public launch (per-IP and per-email caps).
- **No row-level security** in Supabase. The anon key still has full read/write on `bytem_settings` if someone knows another user's email. For beta this is OK; for public launch, switch to Supabase Auth or add RLS policies on `auth.email() = email`.
- **Token cleanup is manual.** Expired tokens accumulate in `bytem_login_tokens`. Either run the commented-out `pg_cron` line in the migration, or just `delete from bytem_login_tokens where expires_at < now() - interval '1 day'` periodically.
- **No "remember me" past localStorage.** If someone clears their browser they re-login via magic link. Acceptable.
- **Onboarding "Inventory" step is still ingredient-sourcing-shaped.** For turnkey co-pack folks (Eli, Zoë), the Google Sheet of ingredients doesn't apply cleanly. Skippable for now; a turnkey-friendly variant of this step is a Session 5 concern, not 4.

## What didn't change (intentionally)

- `parse-po.js`, `check-inventory.js`, `gmail-poll.js`, `gmail-callback.js`, `parse-reply.js` — already user-scoped via the email param. No changes needed.
- The `bytem_settings`, `bytem_email_threads` schemas — already keyed by email.
- The dashboard's PO parsing / supplier email / payment governance flows — same product, just now usable by anyone, not just BYTE'M.

## Roadmap reminder

| Session | Status | Scope |
| --- | --- | --- |
| 1 | ✓ done | PO parsing, inventory check, drafted emails, payment governance |
| 2 | ✓ done | Supabase persistence + onboarding wizard v1 |
| 3 | ✓ done | Gmail OAuth, reply parsing, draft response |
| **4** | **this session** | **Magic-link login, no-overwrite onboarding, brand-neutral defaults, sign-out** |
| 5 | next | Invoice Inbox (the AgentWallet moat made consumer-visible — answers Erin's specific ask, satisfies Steven Cruz's "let an agent place bets" framing) |
| 6 | later | Stripe payment execution + Slack notifications + audit trail page |
| 7 | later | Mobile polish, demo video, public beta launch |

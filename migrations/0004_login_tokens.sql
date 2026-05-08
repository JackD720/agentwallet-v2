-- 0004_login_tokens.sql
-- Session 4: magic-link login support.
-- Tokens are short-lived (15 min) and single-use.
-- Run this in the Supabase SQL editor.

create table if not exists public.bytem_login_tokens (
  token       text        primary key,
  email       text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used        boolean     not null default false,
  user_agent  text,
  ip          text
);

create index if not exists bytem_login_tokens_email_idx
  on public.bytem_login_tokens (email);

create index if not exists bytem_login_tokens_expires_at_idx
  on public.bytem_login_tokens (expires_at);

-- Optional: cron-style cleanup of expired tokens.
-- Supabase pg_cron syntax shown for reference; safe to skip and clean manually.
-- select cron.schedule(
--   'bytem-login-tokens-cleanup',
--   '*/15 * * * *',
--   $$ delete from public.bytem_login_tokens where expires_at < now() - interval '1 day' $$
-- );

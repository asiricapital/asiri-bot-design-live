-- Asiri Capital v6.3 — secure read-only broker storage
-- Run once in Supabase SQL Editor before enabling persistent Saxo OAuth.

create extension if not exists pgcrypto;

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim' check (environment in ('sim','live')),
  mode text not null default 'read-only' check (mode = 'read-only'),
  token_ciphertext text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.broker_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim',
  source text not null default 'oauth',
  status text not null check (status in ('success','rejected','error')),
  positions_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.broker_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim',
  source text not null default 'oauth',
  snapshot jsonb not null,
  positions_count integer not null default 0,
  is_valid boolean not null default true,
  warnings jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists broker_sync_runs_user_created_idx
  on public.broker_sync_runs (user_id, started_at desc);
create index if not exists broker_snapshots_user_created_idx
  on public.broker_snapshots (user_id, captured_at desc);

alter table public.broker_connections enable row level security;
alter table public.broker_sync_runs enable row level security;
alter table public.broker_snapshots enable row level security;

-- No client-side policies are intentionally created.
-- Access is only through the Asiri server after validating the Supabase session.
revoke all on public.broker_connections from anon, authenticated;
revoke all on public.broker_sync_runs from anon, authenticated;
revoke all on public.broker_snapshots from anon, authenticated;

grant all on public.broker_connections to service_role;
grant all on public.broker_sync_runs to service_role;
grant all on public.broker_snapshots to service_role;

create extension if not exists pgcrypto;

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim',
  mode text not null default 'read-only',
  token_ciphertext text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  status text not null default 'connected',
  last_error text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.broker_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim',
  source text not null,
  snapshot jsonb not null,
  positions_count integer not null default 0,
  is_valid boolean not null default true,
  warnings jsonb not null default '[]'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists broker_snapshots_user_captured_idx
  on public.broker_snapshots (user_id, captured_at desc);

create table if not exists public.broker_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saxo',
  environment text not null default 'sim',
  source text not null,
  status text not null,
  positions_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists broker_sync_runs_user_started_idx
  on public.broker_sync_runs (user_id, started_at desc);

alter table public.broker_connections enable row level security;
alter table public.broker_snapshots enable row level security;
alter table public.broker_sync_runs enable row level security;

drop policy if exists broker_connections_select_own on public.broker_connections;
create policy broker_connections_select_own
on public.broker_connections for select to authenticated
using (auth.uid() = user_id);

drop policy if exists broker_snapshots_select_own on public.broker_snapshots;
create policy broker_snapshots_select_own
on public.broker_snapshots for select to authenticated
using (auth.uid() = user_id);

drop policy if exists broker_sync_runs_select_own on public.broker_sync_runs;
create policy broker_sync_runs_select_own
on public.broker_sync_runs for select to authenticated
using (auth.uid() = user_id);

notify pgrst, 'reload schema';

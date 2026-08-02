-- Asiri Capital v4.5: anonymous private session + trade journal + closed positions
create extension if not exists "pgcrypto";

alter table public.trades add column if not exists reason text;
alter table public.trades add column if not exists realized_pnl numeric;
alter table public.trades add column if not exists position_id uuid;

create table if not exists public.closed_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  quantity numeric not null,
  avg_price numeric not null,
  exit_price numeric not null,
  realized_pnl numeric not null default 0,
  realized_pnl_pct numeric,
  close_reason text,
  notes text,
  opened_at timestamptz,
  closed_at timestamptz default now()
);

alter table public.closed_positions enable row level security;
drop policy if exists "closed_positions_all_own" on public.closed_positions;
create policy "closed_positions_all_own" on public.closed_positions for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.closed_positions to authenticated;

-- Anonymous Supabase users receive the authenticated role, so the existing RLS ownership policies continue to protect each device session.

-- Asiri Decision Intelligence v7.2
-- Immutable decision snapshots + measured outcomes after 1, 3 and 7 completed market sessions.

create extension if not exists "pgcrypto";

create table if not exists public.decision_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_decision_id uuid not null default gen_random_uuid(),
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  decision_at timestamptz not null default now(),
  decision_price numeric not null check (decision_price > 0),
  technical_score numeric not null default 0 check (technical_score between 0 and 100),
  execution_readiness numeric not null default 0 check (execution_readiness between 0 and 100),
  decision_code text,
  decision_label text not null,
  action_text text,
  reason text,
  next_action text,
  market_score numeric check (market_score between 0 and 100),
  market_regime text,
  entry_low numeric,
  entry_high numeric,
  stop_loss numeric,
  target1 numeric,
  target2 numeric,
  risk_reward numeric,
  volume_ratio numeric,
  breakout_confirmed boolean not null default false,
  liquidity_ok boolean not null default false,
  risk_veto boolean not null default false,
  sharia_verified boolean not null default false,
  fomo_guard boolean not null default false,
  gate_results jsonb not null default '[]'::jsonb,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  committee_snapshot jsonb not null default '{}'::jsonb,
  market_snapshot jsonb not null default '{}'::jsonb,
  risk_snapshot jsonb not null default '{}'::jsonb,
  source_version text not null default '7.2.0',
  execution_allowed boolean not null default false check (execution_allowed = false),
  created_at timestamptz not null default now(),
  unique (user_id, client_decision_id)
);

create table if not exists public.decision_intelligence_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null references public.decision_intelligence_snapshots(id) on delete restrict,
  horizon_sessions smallint not null check (horizon_sessions in (1, 3, 7)),
  evaluated_at timestamptz not null,
  evaluation_price numeric not null check (evaluation_price > 0),
  return_pct numeric not null,
  max_favorable_excursion_pct numeric,
  max_adverse_excursion_pct numeric,
  hit_target1 boolean not null default false,
  hit_target2 boolean not null default false,
  hit_stop boolean not null default false,
  outcome_label text not null check (outcome_label in ('WIN','LOSS','MIXED','POSITIVE','NEGATIVE','FLAT')),
  source text not null default 'asiri-market-history',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id, horizon_sessions)
);

create index if not exists decision_intelligence_snapshots_user_time_idx
  on public.decision_intelligence_snapshots (user_id, decision_at desc);
create index if not exists decision_intelligence_snapshots_symbol_time_idx
  on public.decision_intelligence_snapshots (symbol, decision_at desc);
create index if not exists decision_intelligence_outcomes_user_horizon_idx
  on public.decision_intelligence_outcomes (user_id, horizon_sessions, evaluated_at desc);

alter table public.decision_intelligence_snapshots enable row level security;
alter table public.decision_intelligence_outcomes enable row level security;

drop policy if exists "decision_intelligence_snapshots_select_own" on public.decision_intelligence_snapshots;
create policy "decision_intelligence_snapshots_select_own"
  on public.decision_intelligence_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "decision_intelligence_snapshots_insert_own" on public.decision_intelligence_snapshots;
create policy "decision_intelligence_snapshots_insert_own"
  on public.decision_intelligence_snapshots for insert to authenticated
  with check ((select auth.uid()) = user_id and execution_allowed = false);

drop policy if exists "decision_intelligence_outcomes_select_own" on public.decision_intelligence_outcomes;
create policy "decision_intelligence_outcomes_select_own"
  on public.decision_intelligence_outcomes for select to authenticated
  using ((select auth.uid()) = user_id);

-- Outcome writes are performed only by the server service role after historical-price evaluation.
grant select, insert on public.decision_intelligence_snapshots to authenticated;
grant select on public.decision_intelligence_outcomes to authenticated;

create or replace function public.prevent_decision_intelligence_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Decision Intelligence snapshots are immutable';
end;
$$;

drop trigger if exists decision_intelligence_snapshots_immutable_update on public.decision_intelligence_snapshots;
create trigger decision_intelligence_snapshots_immutable_update
before update on public.decision_intelligence_snapshots
for each row execute function public.prevent_decision_intelligence_snapshot_mutation();

drop trigger if exists decision_intelligence_snapshots_immutable_delete on public.decision_intelligence_snapshots;
create trigger decision_intelligence_snapshots_immutable_delete
before delete on public.decision_intelligence_snapshots
for each row execute function public.prevent_decision_intelligence_snapshot_mutation();

create or replace function public.touch_decision_intelligence_outcome_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists decision_intelligence_outcomes_touch_updated_at on public.decision_intelligence_outcomes;
create trigger decision_intelligence_outcomes_touch_updated_at
before update on public.decision_intelligence_outcomes
for each row execute function public.touch_decision_intelligence_outcome_updated_at();

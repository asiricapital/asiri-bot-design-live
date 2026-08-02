-- Asiri Capital v5.7 — Decision Journal & Risk Control

create table if not exists public.position_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid not null references public.portfolio(id) on delete cascade,
  symbol text not null,
  status text not null default 'WATCH' check (status in ('HOLD','WATCH','REDUCE','EXIT')),
  decision_source text not null default 'PERSONAL' check (decision_source in ('ASIRI','EXTERNAL','PERSONAL')),
  risk_level text not null default 'MEDIUM' check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  block_adding boolean not null default false,
  entry_reason text, add_condition text, management_notes text,
  next_review_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, position_id)
);

create table if not exists public.decision_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  decision_type text not null check (decision_type in ('BUY','HOLD','WATCH','REDUCE','EXIT','BLOCK')),
  decision_source text not null default 'PERSONAL' check (decision_source in ('ASIRI','EXTERNAL','PERSONAL')),
  decision_price numeric(18,6), confidence numeric(5,2), stop_loss numeric(18,6), target1 numeric(18,6), target2 numeric(18,6),
  reason text not null, lesson text, outcome_status text not null default 'OPEN' check (outcome_status in ('OPEN','WIN','LOSS','CANCELLED')),
  is_blocked boolean not null default false, metadata jsonb not null default '{}'::jsonb, decision_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists position_plans_user_idx on public.position_plans(user_id, updated_at desc);
create index if not exists decision_journal_user_idx on public.decision_journal(user_id, decision_at desc);
alter table public.position_plans enable row level security; alter table public.decision_journal enable row level security;

drop policy if exists "position_plans_own" on public.position_plans; create policy "position_plans_own" on public.position_plans for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "decision_journal_own" on public.decision_journal; create policy "decision_journal_own" on public.decision_journal for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

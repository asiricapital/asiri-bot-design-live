-- Asiri Capital v5.0: Alert Center + Decision Journal
create extension if not exists "pgcrypto";

alter table public.alerts add column if not exists severity text default 'info';
alter table public.alerts add column if not exists status text default 'unread';
alter table public.alerts add column if not exists rule_key text;
alter table public.alerts add column if not exists payload jsonb default '{}'::jsonb;
alter table public.alerts add column if not exists sent_telegram boolean default false;
alter table public.alerts add column if not exists updated_at timestamptz default now();

create unique index if not exists alerts_user_rule_uidx
on public.alerts(user_id, rule_key)
where rule_key is not null;

create table if not exists public.decision_journal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text,
  decision_type text not null,
  decision text not null,
  confidence numeric,
  reasons jsonb default '[]'::jsonb,
  snapshot jsonb default '{}'::jsonb,
  outcome text,
  outcome_pct numeric,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

alter table public.decision_journal enable row level security;
drop policy if exists "decision_journal_all_own" on public.decision_journal;
create policy "decision_journal_all_own" on public.decision_journal
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.decision_journal to authenticated;

-- Existing alerts RLS policies from v4 remain active.

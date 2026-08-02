-- Asiri Capital v5.5 — Investment Ledger & Accurate P/L
alter table public.trades add column if not exists fees_usd numeric(18,6) not null default 0;
alter table public.trades add column if not exists exchange_rate_sar_per_usd numeric(18,6);
alter table public.trades add column if not exists gross_amount_usd numeric(18,6);
alter table public.trades add column if not exists gross_amount_sar numeric(18,6);

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movement_type text not null check (movement_type in ('DEPOSIT','WITHDRAWAL','DIVIDEND','FEE','FX_GAIN','FX_LOSS')),
  amount_sar numeric(18,6) not null check (amount_sar > 0),
  amount_usd numeric(18,6),
  exchange_rate_sar_per_usd numeric(18,6),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists cash_ledger_user_date_idx on public.cash_ledger(user_id, occurred_at desc);
alter table public.cash_ledger enable row level security;
drop policy if exists "cash_ledger_select_own" on public.cash_ledger;
create policy "cash_ledger_select_own" on public.cash_ledger for select using (auth.uid() = user_id);
drop policy if exists "cash_ledger_insert_own" on public.cash_ledger;
create policy "cash_ledger_insert_own" on public.cash_ledger for insert with check (auth.uid() = user_id);
drop policy if exists "cash_ledger_update_own" on public.cash_ledger;
create policy "cash_ledger_update_own" on public.cash_ledger for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cash_ledger_delete_own" on public.cash_ledger;
create policy "cash_ledger_delete_own" on public.cash_ledger for delete using (auth.uid() = user_id);

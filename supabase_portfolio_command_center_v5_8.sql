-- Asiri Capital v5.8 — Portfolio Reconciliation & Command Center
create table if not exists public.portfolio_reconciliations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  actual_cash_sar numeric not null default 0, actual_investments_sar numeric not null default 0,
  actual_total_sar numeric not null default 0, exchange_rate_sar_per_usd numeric not null default 3.75,
  notes text, reconciled_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index if not exists portfolio_reconciliations_user_idx on public.portfolio_reconciliations(user_id,reconciled_at desc);
alter table public.portfolio_reconciliations enable row level security;
drop policy if exists "portfolio_reconciliations_owner" on public.portfolio_reconciliations;
create policy "portfolio_reconciliations_owner" on public.portfolio_reconciliations for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create table if not exists public.planned_orders (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, position_id uuid,
  symbol text not null, side text not null default 'SELL' check (side in ('BUY','SELL')),
  quantity numeric not null check(quantity>0), target_price_usd numeric not null check(target_price_usd>0),
  actual_price_usd numeric, fees_usd numeric not null default 0,
  status text not null default 'PENDING' check(status in ('PENDING','EXECUTED','CANCELLED','EXPIRED')),
  stage_order integer not null default 1, notes text, executed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists planned_orders_user_idx on public.planned_orders(user_id,status,symbol,stage_order);
alter table public.planned_orders enable row level security;
drop policy if exists "planned_orders_owner" on public.planned_orders;
create policy "planned_orders_owner" on public.planned_orders for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create table if not exists public.portfolio_adjustments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, position_id uuid,
  symbol text not null, adjusted_quantity numeric, adjusted_avg_price numeric,
  reason text, notes text, created_at timestamptz not null default now()
);
alter table public.portfolio_adjustments enable row level security;
drop policy if exists "portfolio_adjustments_owner" on public.portfolio_adjustments;
create policy "portfolio_adjustments_owner" on public.portfolio_adjustments for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

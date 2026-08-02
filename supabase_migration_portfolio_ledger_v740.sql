-- Asiri Capital Portfolio Ledger v7.4.0
-- Append-only transaction history. This migration records externally executed or manually imported activity.
-- It does not place broker orders and does not modify the existing portfolio table.

begin;

create table if not exists public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  broker_code text,
  base_currency text not null default 'USD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.investment_accounts(id) on delete restrict,
  client_transaction_id uuid not null,
  transaction_type text not null check (
    transaction_type in (
      'BUY', 'SELL', 'DIVIDEND', 'FEE', 'INTEREST',
      'TRANSFER_IN', 'TRANSFER_OUT', 'SPLIT', 'REVERSAL'
    )
  ),
  symbol text,
  occurred_at timestamptz not null,
  quantity numeric,
  unit_price numeric,
  gross_amount numeric,
  fee_amount numeric not null default 0,
  currency text not null default 'USD',
  data_source text not null default 'MANUAL',
  external_reference text,
  reversal_of uuid references public.investment_transactions(id) on delete restrict,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  execution_allowed boolean not null default false check (execution_allowed = false),
  created_at timestamptz not null default now(),
  unique (user_id, client_transaction_id),
  check (
    (transaction_type in ('BUY', 'SELL', 'SPLIT') and symbol is not null and quantity is not null)
    or transaction_type not in ('BUY', 'SELL', 'SPLIT')
  ),
  check (
    transaction_type <> 'REVERSAL' or reversal_of is not null
  )
);

create index if not exists investment_accounts_user_idx
  on public.investment_accounts(user_id, is_active);

create index if not exists investment_transactions_user_time_idx
  on public.investment_transactions(user_id, occurred_at desc);

create index if not exists investment_transactions_account_time_idx
  on public.investment_transactions(account_id, occurred_at desc);

create index if not exists investment_transactions_symbol_time_idx
  on public.investment_transactions(symbol, occurred_at desc)
  where symbol is not null;

alter table public.investment_accounts enable row level security;
alter table public.investment_transactions enable row level security;

revoke all on public.investment_accounts from anon;
revoke all on public.investment_transactions from anon;

grant select, insert, update on public.investment_accounts to authenticated;
grant select, insert on public.investment_transactions to authenticated;

create or replace function public.asiri_touch_updated_at_v740()
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

create or replace function public.asiri_block_ledger_mutation_v740()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'investment_transactions is append-only; create a REVERSAL transaction instead';
end;
$$;

drop trigger if exists investment_accounts_touch_updated_at_v740 on public.investment_accounts;
create trigger investment_accounts_touch_updated_at_v740
before update on public.investment_accounts
for each row execute function public.asiri_touch_updated_at_v740();

drop trigger if exists investment_transactions_block_update_v740 on public.investment_transactions;
create trigger investment_transactions_block_update_v740
before update on public.investment_transactions
for each row execute function public.asiri_block_ledger_mutation_v740();

drop trigger if exists investment_transactions_block_delete_v740 on public.investment_transactions;
create trigger investment_transactions_block_delete_v740
before delete on public.investment_transactions
for each row execute function public.asiri_block_ledger_mutation_v740();

drop policy if exists investment_accounts_select_own_v740 on public.investment_accounts;
create policy investment_accounts_select_own_v740
on public.investment_accounts for select
to authenticated
using (user_id = auth.uid());

drop policy if exists investment_accounts_insert_own_v740 on public.investment_accounts;
create policy investment_accounts_insert_own_v740
on public.investment_accounts for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists investment_accounts_update_own_v740 on public.investment_accounts;
create policy investment_accounts_update_own_v740
on public.investment_accounts for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists investment_transactions_select_own_v740 on public.investment_transactions;
create policy investment_transactions_select_own_v740
on public.investment_transactions for select
to authenticated
using (user_id = auth.uid());

drop policy if exists investment_transactions_insert_own_v740 on public.investment_transactions;
create policy investment_transactions_insert_own_v740
on public.investment_transactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and execution_allowed = false
  and exists (
    select 1
    from public.investment_accounts account
    where account.id = account_id
      and account.user_id = auth.uid()
  )
);

comment on table public.investment_transactions is
  'Append-only portfolio ledger. Records external/manual activity; never authorizes broker execution.';

commit;

-- Asiri Capital v7.3.0 — confirmed-only Saxo SIM execution ledger.
-- This migration never enables LIVE trading and never grants order-write access to browser roles.

create extension if not exists pgcrypto;

create table if not exists public.broker_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null,
  preview_id text not null,
  provider text not null default 'saxo' check (provider = 'saxo'),
  environment text not null default 'sim' check (environment = 'sim'),
  execution_mode text not null default 'confirmed-only' check (execution_mode = 'confirmed-only'),
  account_key text not null,
  account_id text,
  symbol text not null,
  uic bigint not null check (uic > 0),
  asset_type text not null default 'Stock' check (asset_type = 'Stock'),
  side text not null check (side in ('Buy', 'Sell')),
  quantity numeric not null check (quantity > 0),
  order_type text not null default 'Limit' check (order_type = 'Limit'),
  limit_price numeric not null check (limit_price > 0),
  duration_type text not null check (duration_type in ('DayOrder', 'GoodTillCancel')),
  notional numeric not null check (notional > 0),
  external_reference text not null,
  manual_order boolean not null default true check (manual_order = true),
  status text not null default 'submitting' check (status in (
    'submitting', 'submitted', 'accepted', 'working', 'partially-filled',
    'filled', 'rejected', 'cancelled', 'unknown'
  )),
  saxo_order_id text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, request_id),
  unique (user_id, external_reference)
);

create table if not exists public.broker_order_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text,
  preview_id text,
  event_type text not null,
  status text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists broker_orders_user_created_idx
  on public.broker_orders (user_id, created_at desc);
create index if not exists broker_orders_user_status_idx
  on public.broker_orders (user_id, status, updated_at desc);
create index if not exists broker_orders_saxo_order_idx
  on public.broker_orders (saxo_order_id)
  where saxo_order_id is not null;
create index if not exists broker_order_events_user_created_idx
  on public.broker_order_events (user_id, created_at desc);
create index if not exists broker_order_events_request_idx
  on public.broker_order_events (user_id, request_id, created_at asc)
  where request_id is not null;

create or replace function public.broker_touch_updated_at_v730()
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

drop trigger if exists broker_orders_touch_updated_at_v730 on public.broker_orders;
create trigger broker_orders_touch_updated_at_v730
before update on public.broker_orders
for each row execute function public.broker_touch_updated_at_v730();

alter table public.broker_orders enable row level security;
alter table public.broker_order_events enable row level security;

revoke all on table public.broker_orders from anon, authenticated;
revoke all on table public.broker_order_events from anon, authenticated;
grant select on table public.broker_orders to authenticated;
grant select on table public.broker_order_events to authenticated;

-- Users may inspect only their own audit trail. All inserts and status updates are server-side.
drop policy if exists broker_orders_select_own_v730 on public.broker_orders;
create policy broker_orders_select_own_v730
on public.broker_orders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists broker_order_events_select_own_v730 on public.broker_order_events;
create policy broker_order_events_select_own_v730
on public.broker_order_events
for select
to authenticated
using (auth.uid() = user_id);

comment on table public.broker_orders is
  'Confirmed-only Saxo SIM order ledger. Constraints permanently prohibit LIVE, Market orders and non-manual execution.';
comment on column public.broker_orders.request_id is
  'Client x-request-id used as a durable idempotency key; one order result per user and request id.';
comment on column public.broker_orders.external_reference is
  'Asiri reference included in the Saxo SIM order request for reconciliation.';
comment on table public.broker_order_events is
  'Append-only audit events for preview, human confirmation, submission and broker responses.';

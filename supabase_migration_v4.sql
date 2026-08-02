-- Asiri Capital v4.0: Auth + RLS + Portfolio Manager
create extension if not exists "pgcrypto";

alter table public.portfolio add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.portfolio add column if not exists updated_at timestamptz default now();
alter table public.trades add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.watchlist add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.alerts add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Existing test rows without a user are removed before enforcing ownership.
delete from public.portfolio where user_id is null;
delete from public.trades where user_id is null;
delete from public.watchlist where user_id is null;
delete from public.alerts where user_id is null;

alter table public.portfolio alter column user_id set not null;
alter table public.trades alter column user_id set not null;
alter table public.watchlist alter column user_id set not null;
alter table public.alerts alter column user_id set not null;

create unique index if not exists portfolio_user_symbol_uidx on public.portfolio(user_id, symbol);
create unique index if not exists watchlist_user_symbol_uidx on public.watchlist(user_id, symbol);

alter table public.portfolio enable row level security;
alter table public.trades enable row level security;
alter table public.watchlist enable row level security;
alter table public.alerts enable row level security;

drop policy if exists "portfolio_select_own" on public.portfolio;
drop policy if exists "portfolio_insert_own" on public.portfolio;
drop policy if exists "portfolio_update_own" on public.portfolio;
drop policy if exists "portfolio_delete_own" on public.portfolio;
create policy "portfolio_select_own" on public.portfolio for select to authenticated using ((select auth.uid()) = user_id);
create policy "portfolio_insert_own" on public.portfolio for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "portfolio_update_own" on public.portfolio for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolio_delete_own" on public.portfolio for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "trades_all_own" on public.trades;
create policy "trades_all_own" on public.trades for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "watchlist_all_own" on public.watchlist;
create policy "watchlist_all_own" on public.watchlist for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "alerts_all_own" on public.alerts;
create policy "alerts_all_own" on public.alerts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.portfolio to authenticated;
grant select, insert, update, delete on public.trades to authenticated;
grant select, insert, update, delete on public.watchlist to authenticated;
grant select, insert, update, delete on public.alerts to authenticated;

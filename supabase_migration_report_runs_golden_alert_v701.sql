-- Asiri Capital v7.0.1
-- Allow Golden Alert delivery records in public.report_runs.
-- Run once in Supabase SQL Editor.

begin;

alter table public.report_runs
  drop constraint if exists report_runs_report_type_check;

alter table public.report_runs
  add constraint report_runs_report_type_check
  check (report_type in ('close', 'premarket', 'sunday-futures', 'golden-alert'));

commit;

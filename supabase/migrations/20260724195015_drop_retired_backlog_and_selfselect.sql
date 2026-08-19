-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260724195015

drop function if exists public.get_staff_week_assignments(uuid, bigint, date);
drop function if exists public.add_backlog_if_missing(uuid, bigint, integer, integer);
drop function if exists public.resolve_backlog_item(uuid, bigint);

drop table if exists public.weekly_self_select;
drop table if exists public.manager_priorities;
drop table if exists public.resource_events;
drop table if exists public.user_backlog;
drop table if exists public.user_backlog_v2;
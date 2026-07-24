-- APPLIED LIVE 2026-07-25 via MCP (roadmap 2.1-2.3). Idempotent; safe re-run.
--
-- Drops the never-adopted self-select/backlog cluster (all verified unused or
-- retired by owner decision: no self-select, no missed-assignment workflow).
--
-- INCIDENT NOTE, for the record: the first application also dropped the uuid
-- overload of get_staff_week_assignments on the (wrong) assumption that the
-- text overload was the live one. The text overload turned out to be a broken
-- abandoned rewrite (uuid=text comparison errors at runtime), so the uuid
-- overload was restored minutes later, minus its user_backlog_v2 read
-- (migration "restore_uuid_week_assignments_overload_backlog_free").
-- Subsequent investigation: that RPC's only consumer is the legacy
-- /review/:cycle/:week page (the useWeeklyAssignmentStatus hook has no
-- importers), and it returns empty assignments for organization-scoped weeks
-- anyway (it compares weekly_assignments.org_id, an ORGANIZATION id, against
-- the caller's practice-group id) — a pre-existing latent bug. Full retirement
-- of both overloads + the Review route is scoped into roadmap 2.4 slice B/C.

drop function if exists public.add_backlog_if_missing(uuid, bigint, integer, integer);
drop function if exists public.resolve_backlog_item(uuid, bigint);

drop table if exists public.weekly_self_select;
drop table if exists public.manager_priorities;
drop table if exists public.resource_events;
drop table if exists public.user_backlog;
drop table if exists public.user_backlog_v2;

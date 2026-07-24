-- ██ STAGED — DO NOT APPLY until the frontend deployed via Lovable includes
-- ██ commit(s) from 2026-07-25 that removed all code references (backlog.ts,
-- ██ siteState.ts deleted; locationState/rollover/weekAssembly trimmed;
-- ██ admin-users edge function redeployed without weekly_self_select cleanup).
-- ██ Schema drops must LAG deployed code (see docs/simplification-roadmap.md,
-- ██ standing rules — the staff.home_route outage).
--
-- Roadmap 2.1-2.3: drop the never-adopted self-select/backlog cluster.
-- Verified 2026-07-24: weekly_self_select, manager_priorities, resource_events,
-- user_backlog all have 0 rows ever; user_backlog_v2 only served the
-- missed-week catch-up flow (owner decision: no such workflow) and the
-- sequencer does not read it. get_coach_roster_summary already returns 0 for
-- backlog_count (2026-07-25 rewrite).
--
-- The uuid overload of get_staff_week_assignments is the legacy one that reads
-- user_backlog_v2; the live PostgREST call resolves to the text overload.
-- Rollback if the participant home errors after applying: restore the uuid
-- overload from migration history / pg_dump (it is not recreated here).

drop function if exists public.get_staff_week_assignments(uuid, bigint, date);
drop function if exists public.add_backlog_if_missing(uuid, bigint, integer, integer);
drop function if exists public.resolve_backlog_item(uuid, bigint);

drop table if exists public.weekly_self_select;
drop table if exists public.manager_priorities;
drop table if exists public.resource_events;
drop table if exists public.user_backlog;
drop table if exists public.user_backlog_v2;

-- NOT included here (still referenced by deployed code — later steps):
--  * staff.coach_scope_type / staff.coach_scope_id — the admin-users edge
--    function's get/update actions still select them; drop only after that
--    cleanup ships (roadmap 1.4 residue).
--  * weekly_focus / weekly_plan / cycle machinery — roadmap 2.4 slices.

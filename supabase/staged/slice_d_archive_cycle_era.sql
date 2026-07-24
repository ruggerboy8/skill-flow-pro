-- ██ STAGED — 2.4 Slice D. DO NOT APPLY until the Lovable publish that includes
-- ██ slices A-C (commits 735c83c4, 703b0527, f1b538ab) is live. The deployed
-- ██ bundle's Builder MonthView still queries weekly_plan until then.
--
-- Archive-in-place: RENAME (not drop) the cycle-era tables. Data is fully
-- preserved and rollback is a rename back. The zzz_ prefix keeps them at the
-- bottom of table lists and out of the way.
alter table if exists public.weekly_focus rename to zzz_archived_weekly_focus;
alter table if exists public.weekly_plan rename to zzz_archived_weekly_plan;
alter table if exists public.site_cycle_state rename to zzz_archived_site_cycle_state;

-- Drop the dead cycle-era functions (verified 2026-07-25: zero callers in src/
-- and supabase/functions/; none are trigger functions — log_score_update and
-- prevent_update_if_scores are deliberately NOT in this list). Includes both
-- overloads of get_staff_week_assignments (its only consumer, the legacy
-- /review page + useWeeklyAssignmentStatus hook, was deleted in slice B).
-- get_performance_trend is NOT dropped (live via AtAGlance; uses only the
-- locations.cycle_length_weeks column, which stays).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'trigger'::regtype
      and p.proname in (
        'backfill_historical_score_timestamps','delete_latest_week_data','delete_week_data',
        'delete_week_data_by_week','get_consistency','get_cycle_week_status','get_focus_cycle_week',
        'get_last_progress_week','get_week_detail_by_week','get_week_in_cycle','get_weekly_review',
        'needs_backfill','recover_orphaned_scores','replace_weekly_focus','retime_backfill_cycle',
        'rewrite_backfill_week','seq_confidence_history_18w','seq_domain_coverage_8w',
        'seq_last_selected_by_move','get_staff_week_assignments'
      )
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

-- NOT in this file (later, separate steps):
--  * staff.coach_scope_type / coach_scope_id column drop — admin-users
--    get/update actions still select them (1.4 residue).
--  * Legacy staff.is_* flag write retirement — RPC caller-eligibility checks
--    still read the flags; modernize those first.
--  * Regenerate src/integrations/supabase/types.ts after applying.

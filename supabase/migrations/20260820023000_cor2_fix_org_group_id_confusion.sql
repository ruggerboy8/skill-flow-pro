-- COR-2: fix org-id vs group-id confusion in database functions, retire the
-- second org resolver in favour of current_user_org_id semantics, and add
-- trigger coverage so staff.organization_id stays correct when a location or
-- a practice group is re-parented.
--
-- NOT APPLIED TO PRODUCTION as of 2026-08-19. This is a migration FILE only,
-- written and committed on branch fix/cor-2-org-group-id-functions. Applying
-- it to the live database (yeypngaufuualdfzcjpk) is a later, supervised step.
--
-- Ground truth for every function below was read live via
-- pg_get_functiondef / pg_proc / aclexplode against the production database
-- on 2026-08-19/20, not assumed from the repo (see CLAUDE.md's DOC-2 note on
-- why repo migration history does not reliably reflect live state). Full
-- verbatim live definitions and the verification queries are recorded in
-- docs/specs/cor-2-org-group-id-fix.md.
--
-- Terminology reminder (see CLAUDE.md): Organization (organizations) is the
-- real multi-tenant entity added 2026-03-06. Group (practice_groups) is the
-- OLD thing this codebase used to call "org" -- a lot of shipped SQL still
-- uses parameter/column names like p_org_id and org_id for values that are
-- actually practice_groups ids, and some for values that are actually
-- organizations ids. The two are both UUIDs, so a mismatch fails silently
-- (matches nothing, returns zero rows) instead of erroring.
--
-- What this migration does NOT touch, and why (verified, not assumed):
--   - get_eval_distribution_metrics, get_location_domain_staff_averages,
--     seq_latest_quarterly_evals(uuid, bigint): SEC-2b's org-vs-group guard
--     bug in these three (merged as
--     supabase/migrations/20260820015735_sec2b_fix_org_group_guard.sql, not
--     yet applied live) is a real instance of this same confusion, already
--     fixed in that migration. Their p_org_id argument and WHERE l.group_id
--     = p_org_id join logic were confirmed (by that migration, and
--     independently re-confirmed here against the same live caller,
--     FilterBar.tsx) to correctly mean a practice_groups id end to end --
--     the caller populates it from practice_groups.id. No further change
--     needed; this migration deliberately does not redefine them a second
--     time.
--   - get_staff_domain_avgs, get_strengths_weaknesses: both named p_org_id
--     and both filter on a group_id column (l.group_id / the enriched view's
--     group_id), the same self-consistent group-id pattern as the three
--     functions above. Neither has any live caller anywhere in src/ or
--     supabase/functions/ (confirmed by grep) to contradict that, so there
--     is no verified join-logic bug to fix here. Their existing guard
--     (super-admin-only) is SEC-1's anon-lock, covered by the regression
--     test at src/security/anonReadSurface.test.ts and is out of scope for
--     COR-2 to loosen or change.
--   - current_user_org_id(): already correct (COALESCE staff.organization_id,
--     then the location -> practice_groups.organization_id chain). Not
--     redefined; get_user_org_id below is rewritten to match its semantics.
--   - is_org_allowed_for_sequencing(uuid): looks p_org_id up directly in
--     practice_groups.id. This was originally "fixed" here on the inference
--     that p_org_id shared weekly_assignments.org_id's real-organization-id
--     semantics (same "org_id" name, same sequencer machinery). A PR review
--     (Codex, PR #42) caught that the inference was wrong for this column
--     and the fix was reverted before merge -- see the full evidence trail
--     (live FK, the delete_organization cascade, the live RLS policies)
--     inline above the function's former section below, and in
--     docs/specs/cor-2-org-group-id-fix.md. p_org_id really is a
--     practice_groups id here; the live body is correct as shipped and this
--     migration does not touch it.
--
-- What this migration DOES fix (verified live, see spec doc for the exact
-- SELECTs and counts):
--   1. get_coach_roster_summary(uuid, date): compares wa.org_id (confirmed
--      live: weekly_assignments.org_id holds real organizations.id values,
--      334/334 non-null rows match organizations.id, 0 match
--      practice_groups.id) against l2.group_id (a practice_groups id).
--      Fixed to resolve the staff's location through to its organization_id
--      before comparing.
--   2. get_user_org_id(uuid): retired in favour of current_user_org_id
--      semantics, per acceptance criteria. NOT dropped (RLS policies on
--      weekly_assignments, practice_groups, locations, weekly_scores,
--      organization_pro_moves, organization_pro_move_overrides, and
--      organization_pro_move_content_overrides all call
--      get_user_org_id(auth.uid()) directly in their USING/WITH CHECK
--      clauses -- confirmed live). Its body is replaced with the same
--      COALESCE(staff.organization_id, location-chain) fallback
--      current_user_org_id() uses, generalized to the passed-in user id, so
--      the 8 staff with a NULL primary_location_id (all of whom have
--      staff.organization_id set directly, confirmed live) resolve
--      correctly instead of getting NULL from the old INNER JOIN-only body.
--   3. Trigger coverage for staff.organization_id re-parenting. The existing
--      trg_staff_fill_organization_id trigger only fills organization_id
--      when it is NULL, and only fires on staff row changes -- nothing
--      re-syncs it when a LOCATION changes practice_groups (locations.group_id)
--      or a PRACTICE GROUP changes organizations (practice_groups.organization_id).
--      Confirmed live: 0 mismatches exist today, so this is a structural gap,
--      not a live data bug. Two new AFTER UPDATE triggers close it.
--
-- Idempotent throughout: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS
-- before CREATE TRIGGER, explicit REVOKE + GRANT after each touched function
-- (CREATE OR REPLACE preserves ACLs across a same-signature replace, but the
-- explicit re-grant removes any doubt -- local Supabase does not auto-grant,
-- per CLAUDE.md -- and matches the pattern SEC-1/SEC-2 use). These grants
-- match get_coach_roster_summary's live named-role ACL exactly. For
-- get_user_org_id, the live ACL also carries a stray PUBLIC grant (the
-- default `=X` entry alongside the named anon/authenticated/service_role
-- grants); REVOKE ALL ... FROM PUBLIC deliberately drops that PUBLIC entry
-- while the following GRANT re-adds the same named-role access, including
-- anon. No role other than the ones already granted by name relies on the
-- PUBLIC entry, so this is a harmless least-privilege tightening, not a
-- functional change -- callers that had access before (anon included, since
-- it is a Batch C predicate function) still have it.
-- SIGNATURE STABILITY: no function's parameter list, name, or return type
-- changes. PostgREST callers using named parameters are unaffected.

-- ============================================================================
-- 1. get_coach_roster_summary(uuid, date)
--    Fix: wa.org_id is a real organizations.id. Resolve the staff's location
--    through practice_groups to organization_id before comparing, instead of
--    comparing directly against locations.group_id (a practice_groups id).
--    SECURITY DEFINER, search_path 'public', and body are otherwise verbatim.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_coach_roster_summary(p_coach_user_id uuid, p_week_start date DEFAULT NULL::date)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, active_monday date, required_count integer, conf_submitted_count integer, conf_late_count integer, perf_submitted_count integer, perf_late_count integer, backlog_count integer, last_conf_at timestamp with time zone, last_perf_at timestamp with time zone, tz text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date;
  v_coach_staff_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_week_start := date_trunc('week', COALESCE(p_week_start, (NOW() AT TIME ZONE 'America/Chicago')::date))::date;

  SELECT s.id, s.is_super_admin
  INTO v_coach_staff_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_lead OR s.is_super_admin OR s.is_org_admin OR s.is_office_manager)
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    SELECT cs.scope_type, cs.scope_id
    FROM coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
  ),
  visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM coach_scopes_expanded cse
          WHERE (cse.scope_type = 'org' AND l.group_id = cse.scope_id)
             OR (cse.scope_type = 'location' AND l.id = cse.scope_id)
        )
      )
  ),
  staff_assignments AS (
    SELECT
      vs.staff_id,
      wa.id AS assignment_id
    FROM visible_staff vs
    INNER JOIN staff st ON st.id = vs.staff_id
    LEFT JOIN weekly_assignments wa ON
      wa.role_id = st.role_id
      AND wa.week_start_date = v_week_start
      AND wa.status = 'locked'
      AND (
        wa.org_id IS NULL
        OR wa.org_id = (
          SELECT pg2.organization_id
          FROM locations l2
          JOIN practice_groups pg2 ON pg2.id = l2.group_id
          WHERE l2.id = st.primary_location_id
        )
      )
      AND (wa.location_id IS NULL OR wa.location_id = st.primary_location_id)
  ),
  staff_scores AS (
    SELECT
      sa.staff_id,
      sa.assignment_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_assignments sa
    LEFT JOIN weekly_scores ws ON
      ws.staff_id = sa.staff_id
      AND ws.assignment_id = ('assign:' || sa.assignment_id)
  ),
  staff_aggregates AS (
    SELECT
      ss.staff_id,
      COUNT(ss.assignment_id) AS required_count,
      COUNT(ss.confidence_score) AS conf_submitted_count,
      SUM(CASE WHEN ss.confidence_late = true THEN 1 ELSE 0 END) AS conf_late_count,
      COUNT(ss.performance_score) AS perf_submitted_count,
      SUM(CASE WHEN ss.performance_late = true THEN 1 ELSE 0 END) AS perf_late_count,
      MAX(ss.confidence_date) AS last_conf_at,
      MAX(ss.performance_date) AS last_perf_at
    FROM staff_scores ss
    WHERE ss.assignment_id IS NOT NULL
    GROUP BY ss.staff_id
  )
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id::bigint,
    r.role_name,
    s.primary_location_id AS location_id,
    l.name AS location_name,
    l.group_id,
    o.name AS group_name,
    v_week_start AS active_monday,
    COALESCE(sa.required_count, 0)::int AS required_count,
    COALESCE(sa.conf_submitted_count, 0)::int AS conf_submitted_count,
    COALESCE(sa.conf_late_count, 0)::int AS conf_late_count,
    COALESCE(sa.perf_submitted_count, 0)::int AS perf_submitted_count,
    COALESCE(sa.perf_late_count, 0)::int AS perf_late_count,
    0::int AS backlog_count,
    sa.last_conf_at,
    sa.last_perf_at,
    l.timezone AS tz
  FROM visible_staff vs
  INNER JOIN staff s ON s.id = vs.staff_id
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN practice_groups o ON o.id = l.group_id
  LEFT JOIN staff_aggregates sa ON sa.staff_id = s.id
  ORDER BY s.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_coach_roster_summary(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_roster_summary(uuid, date) TO authenticated, service_role;

-- ============================================================================
-- is_org_allowed_for_sequencing(uuid) -- NOT CHANGED. Originally this
-- migration also "fixed" this function to check practice_groups.organization_id
-- instead of practice_groups.id, on the inference that p_org_id shared
-- weekly_assignments.org_id's real-organization-id semantics because both
-- columns are named "org_id" on the same sequencer machinery. A PR review
-- (Codex, PR #42) caught that this inference was wrong for this specific
-- column and the fix was reverted before merge. Live-verified evidence:
--   - sequencer_runs.org_id and the archived zzz_archived_weekly_plan.org_id
--     both carry a live FK straight to practice_groups(id)
--     (sequencer_runs_org_id_fkey, weekly_plan_org_id_fkey) -- a real
--     organizations.id could never satisfy that FK.
--   - supabase/functions/admin-users/index.ts's delete_organization cascade
--     deletes sequencer_runs by `org_id IN groupIds`, where groupIds is
--     resolved from practice_groups.id (`.from("practice_groups").select("id")
--     .eq("organization_id", organization_id)`), i.e. group ids, not org ids.
--   - The live INSERT policies on both tables ("Service role inserts
--     sequencer runs for global and allowed orgs" on sequencer_runs,
--     "System can insert global and allowed org plans" on
--     zzz_archived_weekly_plan) call is_org_allowed_for_sequencing(org_id)
--     directly against that same FK-constrained column.
-- So p_org_id here really is a practice_groups id end to end, and the
-- original body (EXISTS practice_groups WHERE id = p_org_id AND active) is
-- correct as shipped. The reverted version would have rejected every
-- FK-valid value the RLS policies are meant to allow, while no value that
-- could pass it would ever satisfy the FK -- org-scoped sequencer runs would
-- have become impossible to insert. Full evidence and the disproved
-- inference are recorded in docs/specs/cor-2-org-group-id-fix.md.
-- The `p_org_id` / `org_id` NAMING is still the misleading part (this
-- column predates the 2026-03-06 organizations split, from when
-- practice_groups was the thing this codebase called "org" -- see
-- CLAUDE.md's terminology table). A rename is its own follow-up ticket,
-- coordinated with the FK, the RLS policies, and admin-users/index.ts, not
-- something to fold into tonight's fix.
-- ============================================================================

-- ============================================================================
-- 2. get_user_org_id(uuid) -- RETAINED, NOT DROPPED, for compatibility only.
--    Acceptance wants the two competing resolvers unified on
--    current_user_org_id's semantics. This function stays because RLS
--    policies on weekly_assignments, practice_groups, locations,
--    weekly_scores, organization_pro_moves, organization_pro_move_overrides
--    and organization_pro_move_content_overrides all call
--    get_user_org_id(auth.uid()) directly in USING/WITH CHECK (confirmed
--    live via pg_policy) -- dropping it would break those policies.
--    Old body: INNER JOIN staff -> locations -> practice_groups only, no
--    fallback, so the 8 staff with primary_location_id IS NULL (all of whom
--    have staff.organization_id set directly, confirmed live) got NULL and
--    saw no weekly assignments.
--    New body: same COALESCE(staff.organization_id, location-chain)
--    fallback as current_user_org_id(), generalized to the given user id.
--    New callers should prefer current_user_org_id() directly; this
--    parameterized form is compatibility-only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_org_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    s.organization_id,
    (SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1)
  )
  FROM public.staff s
  WHERE s.user_id = p_user_id
  ORDER BY s.organization_id NULLS LAST
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_user_org_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_org_id(uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. Trigger coverage: keep staff.organization_id in sync when a LOCATION is
--    re-parented to a different practice group, or a PRACTICE GROUP is
--    re-parented to a different organization. Mirrors how the existing
--    trg_staff_fill_organization_id / staff_fill_organization_id() trigger
--    computes the value (locations -> practice_groups.organization_id), but
--    unconditionally resyncs on re-parent rather than only filling a NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_staff_organization_id_on_location_reparent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    UPDATE public.staff s
    SET organization_id = (
      SELECT pg.organization_id
      FROM public.practice_groups pg
      WHERE pg.id = NEW.group_id
    )
    WHERE s.primary_location_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_staff_org_on_location_reparent ON public.locations;
CREATE TRIGGER trg_sync_staff_org_on_location_reparent
  AFTER UPDATE OF group_id ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_staff_organization_id_on_location_reparent();

CREATE OR REPLACE FUNCTION public.sync_staff_organization_id_on_group_reparent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    UPDATE public.staff s
    SET organization_id = NEW.organization_id
    FROM public.locations l
    WHERE l.id = s.primary_location_id
      AND l.group_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_staff_org_on_group_reparent ON public.practice_groups;
CREATE TRIGGER trg_sync_staff_org_on_group_reparent
  AFTER UPDATE OF organization_id ON public.practice_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_staff_organization_id_on_group_reparent();

-- Neither trigger function is directly anon/authenticated-callable (they are
-- not RPCs, only fired by UPDATE on locations/practice_groups, which already
-- have their own RLS), so no grant changes are needed for them.

-- ============================================================================
-- Sanity check. Existence, signature, and SECURITY DEFINER only -- this runs
-- at migration-apply time and does not write any data. It cannot assert the
-- runtime join-logic fix produces the right rows (that needs real
-- weekly_assignments / practice_groups rows exercised as different callers,
-- which is a supervised QA step after this migration is applied, not
-- something a plain apply-time SQL block can prove).
-- ============================================================================

DO $$
DECLARE
  v_missing text := '';
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_coach_roster_summary(uuid, date)',
    'public.get_user_org_id(uuid)'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = v_sig::regprocedure
        AND p.prosecdef = true
    ) THEN
      v_missing := v_missing || v_sig || '; ';
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'COR-2 sanity check failed, not SECURITY DEFINER or missing: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'locations'
      AND t.tgname = 'trg_sync_staff_org_on_location_reparent'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'COR-2 sanity check failed: trg_sync_staff_org_on_location_reparent missing on locations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'practice_groups'
      AND t.tgname = 'trg_sync_staff_org_on_group_reparent'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'COR-2 sanity check failed: trg_sync_staff_org_on_group_reparent missing on practice_groups';
  END IF;
END $$;

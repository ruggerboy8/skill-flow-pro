-- SEC-2b fix: correct org-vs-group id confusion in caller-scope guards.
--
-- SEC-2b (supabase/migrations/20260820013200_sec2b_add_caller_scope_checks.sql,
-- merged to main but NOT YET APPLIED to the database) added guards of the
-- form:
--   IF <scoping arg> IS DISTINCT FROM current_user_org_id()
--      AND NOT EXISTS (... is_super_admin ...)
--   THEN RAISE EXCEPTION 'forbidden'; END IF;
--
-- current_user_org_id() always returns the caller's ORGANIZATION id
-- (organizations.id, via staff.organization_id or practice_groups.organization_id).
--
-- For three of the ten functions SEC-2b guarded, the argument SEC-2b compared
-- directly against current_user_org_id() is named p_org_id but is not actually
-- an organizations.id -- it is a practice_groups.id (a GROUP id). Confirmed by
-- reading each function's body: all three filter with `l.group_id = p_org_id`,
-- and `locations.group_id` is a foreign key to `practice_groups.id` (confirmed
-- live: constraint locations_org_fkey / locations_organization_id_fkey both
-- read "FOREIGN KEY (group_id) REFERENCES practice_groups(id)"). The
-- eval-results-v2 UI confirms the same thing from the caller side: FilterBar.tsx
-- populates `filters.organizationId` from `.from('practice_groups')` and then
-- filters locations with `.eq('group_id', filters.organizationId)` -- so the
-- value the UI actually sends as p_org_id is a practice_groups.id.
--
-- Comparing a group id to an org id rejects every legitimate non-super-admin
-- caller with "forbidden", breaking the screens that call these functions.
-- This is the org-vs-group id confusion described in CLAUDE.md's terminology
-- section (practice_groups was historically mis-called "organization").
--
-- Fix: resolve the group's organization_id first
-- (select organization_id from practice_groups where id = <arg>), then compare
-- THAT to current_user_org_id(). Function bodies are otherwise verbatim --
-- only the guard's comparison changes.
--
-- The other seven functions SEC-2b guarded were reviewed the same way (read
-- live pg_get_functiondef, checked how the scoping arg is used in the body)
-- and were found already correct:
--   - get_staff_weekly_scores: guards via auth.uid() = p_coach_user_id, not an
--     org compare at all. Not touched.
--   - save_eval_acknowledgement_and_focus (4-arg): guards via eval ownership
--     (caller's own staff.id = evaluations.staff_id) or super admin, via
--     auth.uid(). Not touched.
--   - get_calibration, get_performance_trend, get_best_weekly_win,
--     get_evaluations_summary (both overloads): scoping arg is p_staff_id,
--     used in the body as `staff.id = p_staff_id` / `ws.staff_id = p_staff_id`
--     / `e.staff_id = p_staff_id` -- a genuine staff id, correctly resolved
--     via org_id_of_staff(p_staff_id). Not touched.
--
-- Idempotent: CREATE OR REPLACE is safe to re-run.
-- Not applied by this branch. Read-only MCP (pg_get_functiondef, information
-- schema, pg_constraint) was used against the live database to confirm each
-- function's body and the locations.group_id -> practice_groups.id
-- relationship before writing this file. Application to the database is a
-- later, supervised step (see scripts/sec-verification/sec2b-fix-README.md).

select set_config('app.change_reason', 'batch: SEC-2b fix - correct org-vs-group id guard comparison in 3 functions', true);

-- ============================================================================
-- 1. get_location_domain_staff_averages(uuid, ...) -- scoping arg: p_org_id
--    Body: `WHERE l.group_id = p_org_id` -- p_org_id is a practice_groups.id
--    (GROUP id), not an organizations.id.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_include_no_eval boolean DEFAULT false, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(location_id uuid, location_name text, staff_id uuid, staff_name text, role_id integer, role_name text, domain_id integer, domain_name text, n_items bigint, avg_observer numeric, avg_self numeric, eval_status text, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT pg.organization_id FROM public.practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH eval_items AS (
    SELECT
      e.id AS eval_id,
      e.staff_id,
      e.status AS eval_status,
      ei.domain_id,
      ei.observer_score,
      ei.self_score
    FROM evaluations e
    JOIN evaluation_items ei ON ei.evaluation_id = e.id
    WHERE e.created_at >= p_start
      AND e.created_at <= p_end
      AND (p_types IS NULL OR e.type = ANY(p_types))
  ),
  staff_domain_agg AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name AS role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      d.domain_id AS domain_id,
      d.domain_name AS domain_name,
      COUNT(ei.observer_score) AS n_items,
      ROUND(AVG(ei.observer_score)::numeric, 2) AS avg_observer,
      ROUND(AVG(ei.self_score)::numeric, 2) AS avg_self,
      ei.eval_status,
      CASE WHEN COUNT(ei.observer_score) > 0 THEN true ELSE false END AS has_eval
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN roles r ON r.role_id = s.role_id
    CROSS JOIN domains d
    LEFT JOIN eval_items ei ON ei.staff_id = s.id AND ei.domain_id = d.domain_id
    WHERE l.group_id = p_org_id
      AND s.is_participant = true
      AND s.is_paused = false
      AND (p_location_ids IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
    GROUP BY s.id, s.name, s.role_id, r.role_name, s.primary_location_id, l.name, d.domain_id, d.domain_name, ei.eval_status
  )
  SELECT
    sda.location_id,
    sda.location_name,
    sda.staff_id,
    sda.staff_name,
    sda.role_id::integer,
    sda.role_name,
    sda.domain_id::integer,
    sda.domain_name,
    sda.n_items,
    sda.avg_observer,
    sda.avg_self,
    sda.eval_status,
    sda.has_eval
  FROM staff_domain_agg sda
  WHERE p_include_no_eval = true OR sda.has_eval = true
  ORDER BY sda.location_name, sda.staff_name, sda.domain_name;
END;
$function$;

-- ============================================================================
-- 2. get_eval_distribution_metrics(uuid, ...) -- scoping arg: p_org_id
--    Body: `WHERE l.group_id = p_org_id` -- p_org_id is a practice_groups.id
--    (GROUP id), not an organizations.id. Confirmed from the caller side too:
--    eval-results-v2's FilterBar.tsx populates this value from
--    `.from('practice_groups')` and filters locations by
--    `.eq('group_id', filters.organizationId)`.
--    NOTE: this function's original definition has no `SET search_path`
--    clause (unlike its siblings), so the guard below schema-qualifies
--    public.practice_groups / public.current_user_org_id / public.staff
--    explicitly rather than relying on session search_path (same approach
--    SEC-2b used here).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_eval_distribution_metrics(p_org_id uuid, p_types text[], p_program_year integer, p_quarter text DEFAULT NULL::text, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(location_id uuid, location_name text, domain_id bigint, domain_name text, role_id integer, role_name text, staff_id uuid, staff_name text, evaluation_id uuid, evaluation_status text, n_items integer, obs_top_box integer, obs_bottom_box integer, self_top_box integer, self_bottom_box integer, mismatch_count integer, obs_mean numeric, self_mean numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF (SELECT pg.organization_id FROM public.practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.location_id::uuid,
    l.name::text AS location_name,
    ei.domain_id::bigint,
    ei.domain_name::text,
    r.role_id::int,
    r.role_name::text,
    e.staff_id::uuid,
    s.name::text AS staff_name,
    e.id::uuid AS evaluation_id,
    e.status::text AS evaluation_status,
    COUNT(*)::int AS n_items,
    COUNT(*) FILTER (WHERE ei.observer_score = 4)::int AS obs_top_box,
    COUNT(*) FILTER (WHERE ei.observer_score IN (1, 2))::int AS obs_bottom_box,
    COUNT(*) FILTER (WHERE ei.self_score = 4)::int AS self_top_box,
    COUNT(*) FILTER (WHERE ei.self_score IN (1, 2))::int AS self_bottom_box,
    COUNT(*) FILTER (WHERE ei.observer_score IS DISTINCT FROM ei.self_score)::int AS mismatch_count,
    ROUND(AVG(ei.observer_score), 1)::numeric(3,1) AS obs_mean,
    ROUND(AVG(ei.self_score), 1)::numeric(3,1) AS self_mean
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = e.location_id
  JOIN roles r ON r.role_id = s.role_id
  WHERE l.group_id = p_org_id
    AND e.type = ANY(p_types)
    AND e.program_year = p_program_year
    AND (p_quarter IS NULL OR e.quarter = p_quarter)
    AND (p_location_ids IS NULL OR e.location_id = ANY(p_location_ids))
    AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
  GROUP BY
    e.location_id,
    l.name,
    ei.domain_id,
    ei.domain_name,
    r.role_id,
    r.role_name,
    e.staff_id,
    s.name,
    e.id,
    e.status;
END;
$function$;

-- ============================================================================
-- 3. seq_latest_quarterly_evals(uuid, bigint) -- 2-arg overload, scoping arg:
--    p_org_id. Body: `WHERE l.group_id = p_org_id` -- p_org_id is a
--    practice_groups.id (GROUP id), not an organizations.id.
--    The 1-arg overload, seq_latest_quarterly_evals(integer), is unaffected
--    (not guarded by SEC-2b, not touched here).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(p_org_id uuid, p_role_id bigint)
 RETURNS TABLE(competency_id bigint, score01 numeric, effective_date text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT pg.organization_id FROM public.practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    ei.competency_id,
    AVG(ei.observer_score / 10.0) AS score01,
    TO_CHAR(MAX(e.updated_at)::date, 'YYYY-MM-DD') AS effective_date
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.group_id = p_org_id
    AND e.type = 'Quarterly'
    AND e.status = 'submitted'
    AND ei.observer_score IS NOT NULL
  GROUP BY ei.competency_id;
END;
$function$;

-- ============================================================================
-- Sanity check: existence + SECURITY DEFINER only, same style as SEC-2b's own
-- check. Runtime behavior under different calling roles cannot be asserted
-- from plain SQL in a migration -- see scripts/sec-verification/sec2b-fix-README.md
-- for the supervised runtime verification steps.
-- ============================================================================

DO $$
DECLARE
  v_missing text := '';
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])',
    'public.get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])',
    'public.seq_latest_quarterly_evals(uuid, bigint)'
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
    RAISE EXCEPTION 'SEC-2b fix sanity check failed, not SECURITY DEFINER or missing: %', v_missing;
  END IF;
END $$;

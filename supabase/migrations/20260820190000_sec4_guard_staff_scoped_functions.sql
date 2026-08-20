-- SEC-4: guard two staff-scoped SECURITY DEFINER functions that were missed by
-- the SEC-2 sweep.
--
-- THE HOLE (verified live 2026-08-20). Both functions below are SECURITY
-- DEFINER, granted EXECUTE to `authenticated`, and take a staff id parameter,
-- but their bodies perform NO caller-authorization check. Any logged-in user at
-- any organization could pass an arbitrary p_staff_id and read that staff
-- member's data:
--   * public.get_staff_all_weekly_scores(uuid) -- weekly confidence/performance
--     scores plus staff_email, organization_id/name.
--   * public.get_staff_submission_windows(uuid, date) -- per-week submission
--     timing.
-- Their sibling public.get_staff_weekly_scores(uuid, text) was already guarded
-- in SEC-2b (migration 20260820013200); this migration closes the same class of
-- hole on the two that sweep missed.
--
-- WHAT THIS DOES.
--   1. Adds ONE reusable guard, public.can_current_user_view_staff(uuid), that
--      returns true only when the CALLER (auth.uid(), never a parameter) is
--      authorized to view the target staff member. Every branch of the guard
--      mirrors an access path that already exists live -- it grants nothing new,
--      it just moves the existing RLS/visibility model in front of these two
--      RPCs:
--        - self:            caller IS that staff member.
--        - super admin:     mirrors is_super_admin(auth.uid()) in the staff
--                           SELECT policy "Coaches can read staff in own org".
--        - org-scoped coach/admin: mirrors that same policy's
--                           is_coach_or_admin(auth.uid())
--                           AND org_id_of_staff(id) = current_user_org_id().
--        - office manager:  mirrors the staff SELECT policy "Office managers can
--                           read staff in scoped locations"
--                           (is_office_manager_for_location(primary_location_id)).
--        - lead over the target's location: mirrors the coach_scopes visibility
--                           model that public.get_coach_roster_summary already
--                           uses to build the lead/coach Team roster
--                           (coach_scopes.scope_type 'location' = location id,
--                           'org' = location.group_id). Leads are is_lead = true
--                           and are NOT is_coach (verified: 10 leads, 0 coaches),
--                           so a coach-only guard would have broken their roster;
--                           this coach_scopes branch keeps it working.
--   2. Prepends a guard call to each of the two functions with CREATE OR
--      REPLACE. The entire existing body is reproduced verbatim (fetched live
--      before writing this file); only the guard is added at the top.
--
-- NOT APPLIED by this branch. Read-only MCP was used to fetch the exact live
-- definitions. Application to the database is a later, supervised step via the
-- dashboard SQL editor.
--
-- Idempotent / SQL-editor-safe: CREATE OR REPLACE throughout; re-runnable.

select set_config('app.change_reason', 'SEC-4: guard staff-scoped functions', true);

-- ============================================================================
-- 0. Reusable caller-authorization guard.
--    Returns true iff auth.uid() may view p_staff_id. SECURITY DEFINER so it
--    can read staff / coach_scopes regardless of the caller's own RLS, exactly
--    as the helper functions it composes already do.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_current_user_view_staff(p_staff_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- self: caller is that staff member
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = p_staff_id AND s.user_id = auth.uid()
    )
    -- super admin
    OR public.is_super_admin(auth.uid())
    -- coach / admin whose org contains the target
    -- (mirrors staff SELECT policy "Coaches can read staff in own org")
    OR (
      public.is_coach_or_admin(auth.uid())
      AND public.org_id_of_staff(p_staff_id) = public.current_user_org_id()
    )
    -- office manager scoped to the target's location
    -- (mirrors staff SELECT policy "Office managers can read staff in scoped locations")
    OR EXISTS (
      SELECT 1 FROM public.staff t
      WHERE t.id = p_staff_id
        AND public.is_office_manager_for_location(t.primary_location_id)
    )
    -- lead (or other roster-capable staffer) whose coach_scopes cover the
    -- target's location or its practice group. Mirrors the visibility model in
    -- public.get_coach_roster_summary: scope_type 'location' matches the
    -- location id, scope_type 'org' matches the location's group_id.
    OR EXISTS (
      SELECT 1
      FROM public.staff caller
      JOIN public.coach_scopes cs ON cs.staff_id = caller.id
      JOIN public.staff t ON t.id = p_staff_id
      JOIN public.locations l ON l.id = t.primary_location_id
      WHERE caller.user_id = auth.uid()
        AND (
          caller.is_coach OR caller.is_lead OR caller.is_super_admin
          OR caller.is_org_admin OR caller.is_office_manager
        )
        AND (
          (cs.scope_type = 'location' AND cs.scope_id = l.id)
          OR (cs.scope_type = 'org' AND cs.scope_id = l.group_id)
        )
    );
$function$;

-- ============================================================================
-- 1. get_staff_all_weekly_scores(uuid)
--    Guard prepended; body otherwise verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_all_weekly_scores(p_staff_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, week_of date, action_id bigint, action_statement text, domain_id bigint, domain_name text, confidence_score integer, performance_score integer, confidence_date timestamp with time zone, performance_date timestamp with time zone, confidence_late boolean, performance_late boolean, is_self_select boolean, display_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_current_user_view_staff(p_staff_id) THEN
    RAISE EXCEPTION 'not authorized to view this staff member' USING errcode = '42501';
  END IF;

  RETURN QUERY
  WITH staff_info AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      s.primary_location_id,
      s.hire_date,
      s.participation_start_at,
      r.role_name,
      l.name AS loc_name,
      l.group_id AS org_id,
      o.organization_id AS organization_id,
      o.name AS org_name
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.role_id
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN practice_groups o ON l.group_id = o.id
    WHERE s.id = p_staff_id
  ),
  scored_weeks AS (
    SELECT
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS group_id,
      si.org_name AS group_name,
      ws.week_of,
      COALESCE(wa.action_id, ws.site_action_id, ws.selected_action_id) AS action_id,
      COALESCE(pm_wa.action_statement, opm_wa.action_statement, pm_sa.action_statement) AS action_statement,
      COALESCE(c_wa.domain_id, c_sa.domain_id) AS domain_id,
      COALESCE(d_wa.domain_name, d_sa.domain_name) AS domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      COALESCE(wa.self_select, false) AS is_self_select,
      COALESCE(wa.display_order, 0) AS display_order
    FROM staff_info si
    INNER JOIN weekly_scores ws ON ws.staff_id = si.id
    LEFT JOIN weekly_assignments wa ON ws.assignment_id = ('assign:' || wa.id::text)
    LEFT JOIN pro_moves pm_wa ON wa.action_id = pm_wa.action_id
    LEFT JOIN organization_pro_moves opm_wa ON opm_wa.id = wa.org_move_id
    LEFT JOIN competencies c_wa ON c_wa.competency_id = COALESCE(pm_wa.competency_id, opm_wa.competency_id, wa.competency_id)
    LEFT JOIN domains d_wa ON c_wa.domain_id = d_wa.domain_id
    -- weekly_focus retired 2026-07-25: legacy rows resolve via site_action_id
    LEFT JOIN pro_moves pm_sa ON ws.assignment_id IS NULL AND pm_sa.action_id = COALESCE(ws.site_action_id, ws.selected_action_id)
    LEFT JOIN competencies c_sa ON pm_sa.competency_id = c_sa.competency_id
    LEFT JOIN domains d_sa ON c_sa.domain_id = d_sa.domain_id
    WHERE ws.week_of NOT IN (SELECT week_start_date FROM excused_weeks)
  ),
  unscored_assignments AS (
    SELECT
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS group_id,
      si.org_name AS group_name,
      wa.week_start_date AS week_of,
      wa.action_id,
      COALESCE(pm.action_statement, opm.action_statement) AS action_statement,
      c.domain_id,
      d.domain_name,
      NULL::integer AS confidence_score,
      NULL::integer AS performance_score,
      NULL::timestamptz AS confidence_date,
      NULL::timestamptz AS performance_date,
      NULL::boolean AS confidence_late,
      NULL::boolean AS performance_late,
      wa.self_select AS is_self_select,
      wa.display_order
    FROM staff_info si
    INNER JOIN weekly_assignments wa ON
      wa.role_id = si.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = si.primary_location_id
        OR (wa.location_id IS NULL AND wa.org_id IN (si.organization_id, si.org_id))
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
      AND wa.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
      AND COALESCE(si.participation_start_at::date, si.hire_date) <= (wa.week_start_date + INTERVAL '6 days')::date
      AND NOT (
        wa.source = 'global'
        AND wa.location_id IS NULL
        AND wa.org_id IS NULL
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = si.primary_location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
    LEFT JOIN pro_moves pm ON wa.action_id = pm.action_id
    LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    WHERE NOT EXISTS (
      SELECT 1 FROM weekly_scores ws2
      WHERE ws2.staff_id = si.id
        AND ws2.assignment_id = ('assign:' || wa.id::text)
    )
    AND NOT EXISTS (
      SELECT 1 FROM weekly_scores ws3
      WHERE ws3.staff_id = si.id
        AND ws3.week_of = wa.week_start_date
    )
  )
  SELECT * FROM scored_weeks
  UNION ALL
  SELECT * FROM unscored_assignments
  ORDER BY week_of DESC, display_order;
END;
$function$;

-- ============================================================================
-- 2. get_staff_submission_windows(uuid, date)
--    Guard prepended; body otherwise verbatim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_submission_windows(p_staff_id uuid, p_since date DEFAULT NULL::date)
 RETURNS TABLE(staff_id uuid, staff_name text, week_of date, cycle_number integer, week_in_cycle integer, slot_index integer, action_id bigint, is_self_select boolean, metric text, status text, submitted_at timestamp with time zone, submitted_late boolean, due_at timestamp with time zone, on_time boolean, required boolean, location_id uuid, role_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_current_user_view_staff(p_staff_id) THEN
    RAISE EXCEPTION 'not authorized to view this staff member' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.staff_id,
    v.staff_name,
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.slot_index,
    v.action_id,
    v.is_self_select,
    v.metric,
    v.status,
    v.submitted_at,
    v.submitted_late,
    v.due_at,
    v.on_time,
    v.required,
    v.location_id,
    v.role_id
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.week_of >= p_since)
    AND v.week_of NOT IN (SELECT week_start_date FROM excused_weeks)
    -- Exclude individual excused submissions
    AND NOT EXISTS (
      SELECT 1 FROM excused_submissions es
      WHERE es.staff_id = v.staff_id
        AND es.week_of = v.week_of
        AND es.metric = v.metric
    )
    -- NEW: Exclude location-level excused submissions
    AND NOT EXISTS (
      SELECT 1 FROM excused_locations el
      WHERE el.location_id = v.location_id
        AND el.week_of = v.week_of
        AND el.metric = v.metric
    )
  ORDER BY v.week_of DESC, v.slot_index, v.metric;
END;
$function$;

-- ============================================================================
-- Sanity check. Confirms the guard and both targets exist and are SECURITY
-- DEFINER, and that each target's body now actually contains the guard call.
-- Runtime behavior under different auth contexts cannot be asserted from plain
-- SQL here (that needs calling as different roles in the supervised QA step);
-- this only proves the replace landed and did not de-secure anything.
-- ============================================================================

DO $$
DECLARE
  v_problems text := '';
  v_sig text;
  v_src text;
BEGIN
  -- guard exists and is SECURITY DEFINER
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = 'public.can_current_user_view_staff(uuid)'::regprocedure
      AND p.prosecdef = true
  ) THEN
    v_problems := v_problems || 'can_current_user_view_staff missing or not SECURITY DEFINER; ';
  END IF;

  -- each target: exists, SECURITY DEFINER, and calls the guard
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_staff_all_weekly_scores(uuid)',
    'public.get_staff_submission_windows(uuid, date)'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = v_sig::regprocedure
        AND p.prosecdef = true
    ) THEN
      v_problems := v_problems || v_sig || ' missing or not SECURITY DEFINER; ';
      CONTINUE;
    END IF;

    SELECT p.prosrc INTO v_src
    FROM pg_proc p
    WHERE p.oid = v_sig::regprocedure;

    IF position('can_current_user_view_staff(p_staff_id)' IN v_src) = 0 THEN
      v_problems := v_problems || v_sig || ' body does not contain the guard call; ';
    END IF;
  END LOOP;

  IF v_problems <> '' THEN
    RAISE EXCEPTION 'SEC-4 sanity check failed: %', v_problems;
  END IF;
END $$;

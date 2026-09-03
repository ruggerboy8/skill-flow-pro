-- PML-2b: participant-facing rewording. Extends the COALESCE sweep pattern of
-- 20260612170000 so organization_pro_move_content_overrides.custom_statement
-- (an org's rewording of a platform move) is what participants and coaches
-- actually see at check-in, check-out, and in score history, not just in the
-- admin tab and planner picker, which is all it reached before this ticket
-- (docs/audits/tenant-model-audit-2026-09-03.md finding C).
--
-- Scope discipline: touch ONLY statement resolution in these functions, and
-- ONLY the functions that actually render action_statement. Two functions
-- named in the spec turned out, on inspection, not to select action_statement
-- at all, so they are left untouched here (see the note above each skipped
-- function below) rather than edited for the sake of matching a checklist.
--
-- Overrides apply to platform moves only (an org edits its own org_custom
-- moves directly, not via an override row), so every join below keys off the
-- move actually resolved as the platform action_id in that branch.
--
-- No pro_moves writes here, so app.change_reason is not required by the
-- "Framework content is versioned" rule, but it is harmless to set and gives
-- this migration attribution if anything downstream ever inspects it.
select set_config('app.change_reason', 'PML-2b: apply org content overrides in participant/coach RPCs', true);

-- =====================================================
-- SKIPPED: view_weekly_scores_with_competency
-- Named in the spec's function list, but its SELECT list is
-- (weekly_score_id, staff_id, weekly_focus_id, confidence_score,
-- performance_score, created_at, week_of, role_id, primary_location_id,
-- group_id, action_id, competency_id, domain_id, domain_name). No
-- action_statement column exists to override. Nothing to change.
-- =====================================================

-- =====================================================
-- SKIPPED: get_calibration, get_performance_trend
-- "The analytics functions that render statements" from the spec's
-- description, these two return aggregated domain_name/score data only,
-- never action_statement. Nothing to change.
-- =====================================================

-- =====================================================
-- 1. get_my_weekly_scores
-- Adds the org's content override (matched on the staff row's own org) ahead
-- of the platform statement in the existing COALESCE.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_my_weekly_scores(p_week_of text DEFAULT NULL::text)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id integer, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, week_of date, action_id integer, action_statement text, domain_name text, assignment_id text, weekly_focus_id uuid, self_select boolean, confidence_score integer, confidence_date timestamp with time zone, confidence_late boolean, performance_score integer, performance_date timestamp with time zone, performance_late boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH staff_info AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.group_id,
      o.name AS group_name,
      s.hire_date,
      s.participation_start_at,
      COALESCE(s.organization_id, o.organization_id) AS org_id
    FROM staff s
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN practice_groups o ON o.id = l.group_id
    WHERE s.user_id = v_user_id
  ),
  assignment_scores AS (
    SELECT
      si.staff_id,
      si.role_id,
      si.location_id,
      si.group_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.org_move_id,
      wa.self_select,
      wa.id AS assignment_id,
      NULL::uuid AS weekly_focus_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_info si
    INNER JOIN weekly_assignments wa ON wa.role_id = si.role_id
    LEFT JOIN weekly_scores ws ON (
      ws.staff_id = si.staff_id
      AND ws.week_of = wa.week_start_date
      AND ws.assignment_id = ('assign:' || wa.id)
    )
    WHERE wa.status = 'locked'
      AND (wa.location_id = si.location_id OR wa.location_id IS NULL)
      AND (wa.org_id = si.group_id OR wa.org_id IS NULL)
      AND wa.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND (p_week_of IS NULL OR p_week_of = 'current' OR wa.week_start_date = p_week_of::date)
      AND NOT (
        wa.source = 'global'
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = si.location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
  ),
  focus_scores AS (
    SELECT
      si.staff_id,
      si.role_id,
      si.location_id,
      si.group_id,
      wf.week_start_date,
      wf.action_id,
      wf.competency_id,
      NULL::uuid AS org_move_id,
      wf.self_select,
      NULL AS assignment_id,
      wf.id AS weekly_focus_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_info si
    INNER JOIN weekly_focus wf ON wf.role_id = si.role_id
    LEFT JOIN weekly_scores ws ON (
      ws.staff_id = si.staff_id
      AND ws.week_of = wf.week_start_date
      AND ws.weekly_focus_id = wf.id
    )
    WHERE wf.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND (p_week_of IS NULL OR p_week_of = 'current' OR wf.week_start_date = p_week_of::date)
  ),
  all_scores AS (
    SELECT * FROM assignment_scores
    UNION ALL
    SELECT * FROM focus_scores
  )
  SELECT
    si.staff_id::uuid,
    si.staff_name,
    si.role_id::int,
    si.role_name,
    si.location_id::uuid,
    si.location_name,
    si.group_id::uuid,
    si.group_name,
    s.week_start_date AS week_of,
    COALESCE(s.action_id, c.action_id)::int AS action_id,
    COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement) AS action_statement,
    d.domain_name,
    s.assignment_id,
    s.weekly_focus_id,
    s.self_select,
    s.confidence_score::int,
    s.confidence_date,
    s.confidence_late,
    s.performance_score::int,
    s.performance_date,
    s.performance_late
  FROM all_scores s
  INNER JOIN staff_info si ON si.staff_id = s.staff_id
  LEFT JOIN competencies c ON c.competency_id = s.competency_id
  LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(s.action_id, c.action_id)
  LEFT JOIN organization_pro_moves opm ON opm.id = s.org_move_id
  LEFT JOIN organization_pro_move_content_overrides opmc
    ON opmc.org_id = si.org_id AND opmc.pro_move_id = pm.action_id
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY s.week_start_date DESC, COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement);
END;
$function$;

-- =====================================================
-- 2. get_staff_all_weekly_scores
-- Same pattern: an internal-only org_id CTE column (true_org_id) so the
-- override lookup uses the real organizations.id, not the CTE's existing
-- `org_id` alias (which is actually locations.group_id here, a pre-existing
-- naming leftover from before the organizations split, out of scope to
-- rename in this ticket; current_user_org_id()'s own COALESCE pattern is
-- reused so the resolution matches the platform standard).
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_staff_all_weekly_scores(p_staff_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, week_of date, action_id bigint, action_statement text, domain_id bigint, domain_name text, confidence_score integer, performance_score integer, confidence_date timestamp with time zone, performance_date timestamp with time zone, confidence_late boolean, performance_late boolean, is_self_select boolean, display_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
      o.name AS org_name,
      COALESCE(s.organization_id, o.organization_id) AS true_org_id
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
      COALESCE(wa.action_id, wf.action_id) AS action_id,
      COALESCE(opmc_wa.custom_statement, pm_wa.action_statement, opm_wa.action_statement, opmc_wf.custom_statement, pm_wf.action_statement) AS action_statement,
      COALESCE(c_wa.domain_id, c_wf.domain_id) AS domain_id,
      COALESCE(d_wa.domain_name, d_wf.domain_name) AS domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      COALESCE(wa.self_select, wf.self_select, false) AS is_self_select,
      COALESCE(wa.display_order, wf.display_order, 0) AS display_order
    FROM staff_info si
    INNER JOIN weekly_scores ws ON ws.staff_id = si.id
    LEFT JOIN weekly_assignments wa ON ws.assignment_id = ('assign:' || wa.id::text)
    LEFT JOIN pro_moves pm_wa ON wa.action_id = pm_wa.action_id
    LEFT JOIN organization_pro_moves opm_wa ON opm_wa.id = wa.org_move_id
    LEFT JOIN organization_pro_move_content_overrides opmc_wa
      ON opmc_wa.org_id = si.true_org_id AND opmc_wa.pro_move_id = pm_wa.action_id
    LEFT JOIN competencies c_wa ON c_wa.competency_id = COALESCE(pm_wa.competency_id, opm_wa.competency_id, wa.competency_id)
    LEFT JOIN domains d_wa ON c_wa.domain_id = d_wa.domain_id
    LEFT JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id::text AND ws.assignment_id IS NULL
    LEFT JOIN pro_moves pm_wf ON wf.action_id = pm_wf.action_id
    LEFT JOIN organization_pro_move_content_overrides opmc_wf
      ON opmc_wf.org_id = si.true_org_id AND opmc_wf.pro_move_id = pm_wf.action_id
    LEFT JOIN competencies c_wf ON pm_wf.competency_id = c_wf.competency_id
    LEFT JOIN domains d_wf ON c_wf.domain_id = d_wf.domain_id
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
      COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement) AS action_statement,
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
        OR (wa.location_id IS NULL AND wa.org_id = si.org_id)
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
    LEFT JOIN organization_pro_move_content_overrides opmc
      ON opmc.org_id = si.true_org_id AND opmc.pro_move_id = pm.action_id
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

-- =====================================================
-- 3. get_staff_weekly_scores
-- Coach-facing: each staff row's OWN org resolves the override (a coach can
-- span multiple orgs), not the coach's org. self_select/selected_action_id
-- is confirmed unused in the app today (see weekAssembly.ts: "self-select
-- was never adopted"), so that branch is left as-is.
-- Base: 20260612155626 (keeps the org-admin scope addition), per the header
-- comment in 20260612170000.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(p_coach_user_id uuid, p_week_of text DEFAULT NULL::text)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, score_id uuid, week_of date, assignment_id text, action_id bigint, selected_action_id bigint, confidence_score integer, confidence_date timestamp with time zone, confidence_late boolean, confidence_source score_source, performance_score integer, performance_date timestamp with time zone, performance_late boolean, performance_source score_source, action_statement text, domain_id bigint, domain_name text, display_order integer, self_select boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_staff_id uuid;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
  v_is_org_admin boolean;
  v_org_id uuid;
  v_most_recent_week date;
BEGIN
  SELECT s.id, s.coach_scope_type, s.coach_scope_id, s.is_super_admin, s.is_org_admin, s.organization_id
  INTO v_coach_staff_id, v_coach_scope_type, v_coach_scope_id, v_is_super_admin, v_is_org_admin, v_org_id
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_super_admin OR s.is_org_admin OR s.is_office_manager)
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  IF p_week_of IS NOT NULL THEN
    v_most_recent_week := date_trunc('week', p_week_of::date)::date;
  ELSE
    SELECT MAX((ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date)
    INTO v_most_recent_week
    FROM weekly_scores ws;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    SELECT cs.scope_type, cs.scope_id
    FROM coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
    UNION
    SELECT v_coach_scope_type, v_coach_scope_id
    WHERE v_coach_scope_type IS NOT NULL AND v_coach_scope_id IS NOT NULL
  ),
  filtered_staff AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      r.role_name,
      l.id AS location_id,
      l.name AS location_name,
      o.id AS group_id,
      o.name AS group_name,
      COALESCE(s.organization_id, o.organization_id) AS staff_org_id
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    INNER JOIN practice_groups o ON o.id = l.group_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    WHERE s.is_participant = true
      AND s.is_org_admin = false
      AND s.is_paused = false
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR (v_is_org_admin = true AND v_org_id IS NOT NULL AND s.organization_id = v_org_id)
        OR EXISTS (
          SELECT 1 FROM coach_scopes_expanded cse
          WHERE (cse.scope_type = 'org' AND o.id = cse.scope_id)
             OR (cse.scope_type = 'location' AND l.id = cse.scope_id)
        )
      )
  )
  SELECT
    fs.id AS staff_id,
    fs.name AS staff_name,
    fs.email AS staff_email,
    fs.user_id,
    fs.role_id::bigint,
    fs.role_name,
    fs.location_id,
    fs.location_name,
    fs.group_id,
    fs.group_name,
    ws.id AS score_id,
    (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date AS week_of,
    ws.assignment_id,
    wa.action_id::bigint,
    ws.selected_action_id::bigint,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.confidence_source,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late,
    ws.performance_source,
    COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
    COALESCE(c.domain_id, c_sel.domain_id)::bigint AS domain_id,
    COALESCE(d.domain_name, d_sel.domain_name) AS domain_name,
    wa.display_order,
    wa.self_select
  FROM filtered_staff fs
  LEFT JOIN weekly_scores ws ON ws.staff_id = fs.id
    AND (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date = v_most_recent_week
  LEFT JOIN weekly_assignments wa ON wa.id::text = REPLACE(ws.assignment_id, 'assign:', '')
  LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
  LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
  LEFT JOIN organization_pro_move_content_overrides opmc
    ON opmc.org_id = fs.staff_org_id AND opmc.pro_move_id = pm.action_id
  LEFT JOIN pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
  LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
  LEFT JOIN competencies c_sel ON c_sel.competency_id = pm_sel.competency_id
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  LEFT JOIN domains d_sel ON d_sel.domain_id = c_sel.domain_id
  ORDER BY
    fs.name,
    ws.week_of DESC NULLS LAST,
    ws.performance_date DESC NULLS LAST,
    ws.confidence_date DESC NULLS LAST;
END;
$function$;

-- =====================================================
-- 4. get_staff_week_assignments
-- Staff weekly RPC: same three location/org/global branches as before, each
-- now COALESCEs the staff's own org's content override ahead of the platform
-- statement. v_true_org_id is a fresh, independent resolution (mirrors
-- current_user_org_id()'s own COALESCE); it does NOT reuse the existing
-- v_org_id variable in this function, which is actually locations.group_id
-- (used correctly for its existing purpose, scoping wa.org_id; renaming it
-- is out of scope here, see the get_staff_all_weekly_scores comment above).
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_staff_week_assignments(p_staff_id uuid, p_role_id bigint, p_week_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle int;
  v_week_in_cycle int;
  v_phase text;
  v_cycle_length int;
  v_program_start date;
  v_location_id uuid;
  v_org_id uuid;
  v_true_org_id uuid;
  v_tz text;
  v_assignments jsonb;
  v_required_count int := 0;
  v_conf_count int := 0;
  v_perf_count int := 0;
  v_last_activity_kind text;
  v_last_activity_at timestamptz;
  v_backlog_count int := 0;
BEGIN
  SELECT
    l.cycle_length_weeks,
    l.program_start_date::date,
    l.timezone,
    s.primary_location_id,
    l.group_id
  INTO v_cycle_length, v_program_start, v_tz, v_location_id, v_org_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF v_cycle_length IS NULL THEN
    RAISE EXCEPTION 'No location config for staff %', p_staff_id;
  END IF;

  SELECT COALESCE(s.organization_id, pg.organization_id)
  INTO v_true_org_id
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN practice_groups pg ON pg.id = l.group_id
  WHERE s.id = p_staff_id;

  v_cycle := CASE
    WHEN ((p_week_start - v_program_start) / 7) = 0 THEN 1
    ELSE (((p_week_start - v_program_start) / 7) / v_cycle_length) + 1
  END;

  v_week_in_cycle := CASE
    WHEN ((p_week_start - v_program_start) / 7) = 0 THEN 1
    ELSE (((p_week_start - v_program_start) / 7) % v_cycle_length) + 1
  END;

  v_phase := CASE WHEN v_cycle <= 3 THEN 'focus' ELSE 'plan' END;

  SELECT COUNT(*) INTO v_required_count
  FROM weekly_assignments wa
  WHERE wa.role_id = p_role_id
    AND wa.week_start_date = p_week_start
    AND wa.status = 'locked'
    AND wa.location_id = v_location_id;

  IF v_required_count > 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'focus_id', ('assign:' || wa.id)::text,
        'action_statement', COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement, 'Self-Select'),
        'domain_name', COALESCE(d.domain_name, 'General'),
        'required', NOT wa.self_select,
        'source', 'assignments',
        'confidence_score', ws.confidence_score,
        'confidence_date', ws.confidence_date,
        'confidence_late', ws.confidence_late,
        'performance_score', ws.performance_score,
        'performance_date', ws.performance_date,
        'performance_late', ws.performance_late,
        'display_order', wa.display_order,
        'self_select', wa.self_select,
        'competency_id', COALESCE(pm.competency_id, opm.competency_id, wa.competency_id),
        'action_id', wa.action_id,
        'org_move_id', wa.org_move_id
      ) ORDER BY wa.display_order
    ) INTO v_assignments
    FROM weekly_assignments wa
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
    LEFT JOIN organization_pro_move_content_overrides opmc
      ON opmc.org_id = v_true_org_id AND opmc.pro_move_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON
      ws.staff_id = p_staff_id
      AND ws.assignment_id = ('assign:' || wa.id)::text
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.location_id = v_location_id;
  ELSE
    SELECT COUNT(*) INTO v_required_count
    FROM weekly_assignments wa
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.org_id = v_org_id
      AND wa.location_id IS NULL;

    IF v_required_count > 0 THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'focus_id', ('assign:' || wa.id)::text,
          'action_statement', COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement, 'Self-Select'),
          'domain_name', COALESCE(d.domain_name, 'General'),
          'required', NOT wa.self_select,
          'source', 'assignments',
          'confidence_score', ws.confidence_score,
          'confidence_date', ws.confidence_date,
          'confidence_late', ws.confidence_late,
          'performance_score', ws.performance_score,
          'performance_date', ws.performance_date,
          'performance_late', ws.performance_late,
          'display_order', wa.display_order,
          'self_select', wa.self_select,
          'competency_id', COALESCE(pm.competency_id, opm.competency_id, wa.competency_id),
          'action_id', wa.action_id,
          'org_move_id', wa.org_move_id
        ) ORDER BY wa.display_order
      ) INTO v_assignments
      FROM weekly_assignments wa
      LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
      LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
      LEFT JOIN organization_pro_move_content_overrides opmc
        ON opmc.org_id = v_true_org_id AND opmc.pro_move_id = wa.action_id
      LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
      LEFT JOIN domains d ON d.domain_id = c.domain_id
      LEFT JOIN weekly_scores ws ON
        ws.staff_id = p_staff_id
        AND ws.assignment_id = ('assign:' || wa.id)::text
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.org_id = v_org_id
        AND wa.location_id IS NULL;
    ELSE
      SELECT COUNT(*) INTO v_required_count
      FROM weekly_assignments wa
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.source = 'global'
        AND wa.org_id IS NULL
        AND wa.location_id IS NULL;

      IF v_required_count > 0 THEN
        SELECT jsonb_agg(
          jsonb_build_object(
            'focus_id', ('assign:' || wa.id)::text,
            'action_statement', COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement, 'Self-Select'),
            'domain_name', COALESCE(d.domain_name, 'General'),
            'required', NOT wa.self_select,
            'source', 'assignments',
            'confidence_score', ws.confidence_score,
            'confidence_date', ws.confidence_date,
            'confidence_late', ws.confidence_late,
            'performance_score', ws.performance_score,
            'performance_date', ws.performance_date,
            'performance_late', ws.performance_late,
            'display_order', wa.display_order,
            'self_select', wa.self_select,
            'competency_id', COALESCE(pm.competency_id, opm.competency_id, wa.competency_id),
            'action_id', wa.action_id,
            'org_move_id', wa.org_move_id
          ) ORDER BY wa.display_order
        ) INTO v_assignments
        FROM weekly_assignments wa
        LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
        LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
        LEFT JOIN organization_pro_move_content_overrides opmc
          ON opmc.org_id = v_true_org_id AND opmc.pro_move_id = wa.action_id
        LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
        LEFT JOIN domains d ON d.domain_id = c.domain_id
        LEFT JOIN weekly_scores ws ON
          ws.staff_id = p_staff_id
          AND ws.assignment_id = ('assign:' || wa.id)::text
        WHERE wa.role_id = p_role_id
          AND wa.week_start_date = p_week_start
          AND wa.status = 'locked'
          AND wa.source = 'global'
          AND wa.org_id IS NULL
          AND wa.location_id IS NULL;
      ELSE
        v_assignments := '[]'::jsonb;
      END IF;
    END IF;
  END IF;

  IF v_assignments IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conf_count
    FROM jsonb_array_elements(v_assignments) elem
    WHERE (elem->>'confidence_score') IS NOT NULL;

    SELECT COUNT(*) INTO v_perf_count
    FROM jsonb_array_elements(v_assignments) elem
    WHERE (elem->>'performance_score') IS NOT NULL;
  END IF;

  SELECT
    CASE
      WHEN confidence_date > performance_date OR performance_date IS NULL THEN 'confidence'
      ELSE 'performance'
    END,
    GREATEST(confidence_date, performance_date)
  INTO v_last_activity_kind, v_last_activity_at
  FROM weekly_scores
  WHERE staff_id = p_staff_id
    AND assignment_id LIKE 'assign:%'
    AND (confidence_date IS NOT NULL OR performance_date IS NOT NULL)
  ORDER BY GREATEST(confidence_date, performance_date) DESC NULLS LAST
  LIMIT 1;

  SELECT COUNT(*) INTO v_backlog_count
  FROM user_backlog_v2
  WHERE staff_id = p_staff_id
    AND resolved_on IS NULL;

  RETURN jsonb_build_object(
    'assignments', COALESCE(v_assignments, '[]'::jsonb),
    'status', jsonb_build_object(
      'required_count', v_required_count,
      'confidence_count', v_conf_count,
      'performance_count', v_perf_count,
      'last_activity', jsonb_build_object(
        'kind', v_last_activity_kind,
        'at', v_last_activity_at
      )
    ),
    'week_context', jsonb_build_object(
      'cycle', v_cycle,
      'week_in_cycle', v_week_in_cycle,
      'phase', v_phase,
      'backlog_count', v_backlog_count
    )
  );
END;
$function$;

DO $$
BEGIN
  RAISE NOTICE 'PML-2b: org content override COALESCE applied to get_my_weekly_scores, get_staff_all_weekly_scores, get_staff_weekly_scores, get_staff_week_assignments';
END $$;

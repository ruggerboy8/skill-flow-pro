-- PML-2b: participant-facing rewording. Extends the COALESCE sweep pattern of
-- 20260612170000 so organization_pro_move_content_overrides.custom_statement
-- (an org's rewording of a platform move) is what participants and coaches
-- actually see at check-in, check-out, and in score history, not just in the
-- admin tab and planner picker, which is all it reached before this ticket
-- (docs/audits/tenant-model-audit-2026-09-03.md finding C).
--
-- REWRITTEN 2026-09-03 (Codex review of the first cut of this migration
-- flagged it as reconstructed from stale June migration files rather than
-- pulled from the live database): the base bodies below are copied
-- byte-for-byte from `pg_get_functiondef` against the live prod functions
-- (project yeypngaufuualdfzcjpk) as of this rewrite. The only edits made to
-- each are the ones this ticket asks for: adding an org_id/staff_org_id
-- resolution where the function did not already compute one, and adding an
-- organization_pro_move_content_overrides join ahead of each action_statement
-- COALESCE. Everything else -- including the August security guards
-- (can_current_user_view_staff in get_staff_all_weekly_scores, and the
-- p_coach_user_id-vs-auth.uid() caller check in get_staff_weekly_scores) and
-- the legacy site_action_id/selected_action_id resolution path -- is
-- preserved exactly as it runs in prod today. The stale rewrite's
-- get_staff_week_assignments section is dropped entirely: that function does
-- not exist in prod (confirmed zero rows in pg_proc for that name, and
-- confirmed no src/ caller), so this migration must not resurrect it.
--
-- Scope discipline: touch ONLY statement resolution in these three
-- functions. Two other functions named in the original spec turned out, on
-- inspection, not to select action_statement at all, so they are left
-- untouched here (see the notes below) rather than edited for the sake of
-- matching a checklist.
--
-- Overrides apply to platform moves only (an org edits its own org_custom
-- moves directly, not via an override row), so every added join is guarded
-- with `pro_moves.owner_org_id IS NULL` and keyed off the move actually
-- resolved as the platform action_id in that branch.
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
-- Base: live prod body (legacy_scores CTE resolves pre-assignments-era
-- scores via site_action_id/selected_action_id, NOT weekly_focus --
-- weekly_focus was renamed to zzz_archived_weekly_focus in July and no
-- longer participates in this function in prod). Adds org_id to staff_info
-- and the override join ahead of the existing action_statement COALESCE.
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
  legacy_scores AS (
    -- Pre-assignments-era scores (weekly_focus / weekly_plan retired
    -- 2026-07-25): resolved directly from the score row's site_action_id.
    SELECT
      si.staff_id,
      si.role_id,
      si.location_id,
      si.group_id,
      ws.week_of AS week_start_date,
      COALESCE(ws.site_action_id, ws.selected_action_id)::bigint AS action_id,
      pm_l.competency_id,
      NULL::uuid AS org_move_id,
      false AS self_select,
      NULL::uuid AS assignment_id,
      (CASE WHEN ws.weekly_focus_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN ws.weekly_focus_id::uuid ELSE NULL END) AS weekly_focus_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_info si
    INNER JOIN weekly_scores ws ON ws.staff_id = si.staff_id
    LEFT JOIN pro_moves pm_l ON pm_l.action_id = COALESCE(ws.site_action_id, ws.selected_action_id)
    WHERE ws.assignment_id IS NULL
      AND ws.week_of IS NOT NULL
      AND (p_week_of IS NULL OR p_week_of = 'current' OR ws.week_of = p_week_of::date)
  ),
  all_scores AS (
    SELECT * FROM assignment_scores
    UNION ALL
    SELECT * FROM legacy_scores
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
    s.assignment_id::text,
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
    ON opmc.org_id = si.org_id AND opmc.pro_move_id = pm.action_id AND pm.owner_org_id IS NULL
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY s.week_start_date DESC, COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement);
END;
$function$;

-- =====================================================
-- 2. get_staff_all_weekly_scores
-- Base: live prod body, which already carries the can_current_user_view_staff
-- guard (added 2026-08) and already computes o.organization_id in
-- staff_info -- reused directly for the override join rather than adding a
-- second resolution. Two statement-producing branches exist here
-- (scored_weeks' assignment path AND its legacy site_action_id/
-- selected_action_id path, plus unscored_assignments), so each gets its own
-- override join keyed to the platform move it actually resolves.
-- =====================================================
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
      COALESCE(opmc_wa.custom_statement, pm_wa.action_statement, opm_wa.action_statement, opmc_sa.custom_statement, pm_sa.action_statement) AS action_statement,
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
    LEFT JOIN organization_pro_move_content_overrides opmc_wa
      ON opmc_wa.org_id = si.organization_id AND opmc_wa.pro_move_id = pm_wa.action_id AND pm_wa.owner_org_id IS NULL
    LEFT JOIN competencies c_wa ON c_wa.competency_id = COALESCE(pm_wa.competency_id, opm_wa.competency_id, wa.competency_id)
    LEFT JOIN domains d_wa ON c_wa.domain_id = d_wa.domain_id
    LEFT JOIN pro_moves pm_sa ON ws.assignment_id IS NULL AND pm_sa.action_id = COALESCE(ws.site_action_id, ws.selected_action_id)
    LEFT JOIN organization_pro_move_content_overrides opmc_sa
      ON opmc_sa.org_id = si.organization_id AND opmc_sa.pro_move_id = pm_sa.action_id AND pm_sa.owner_org_id IS NULL
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
    LEFT JOIN organization_pro_move_content_overrides opmc
      ON opmc.org_id = si.organization_id AND opmc.pro_move_id = pm.action_id AND pm.owner_org_id IS NULL
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
-- Base: live prod body, which already carries the caller guard (a non-super
-- admin may only pass p_coach_user_id = auth.uid()) added 2026-08. Coach-
-- facing: each roster row's OWN org resolves the override (a coach can span
-- multiple orgs), not the coach's org, so staff_org_id is added to
-- filtered_staff and used for both the assignment-path and self-select-path
-- override joins.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(p_coach_user_id uuid, p_week_of text DEFAULT NULL::text)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, score_id uuid, week_of date, assignment_id text, action_id bigint, selected_action_id bigint, confidence_score integer, confidence_date timestamp with time zone, confidence_late boolean, confidence_source score_source, performance_score integer, performance_date timestamp with time zone, performance_late boolean, performance_source score_source, action_statement text, domain_id bigint, domain_name text, display_order integer, self_select boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_staff_id uuid;
  v_is_super_admin boolean;
  v_is_org_admin boolean;
  v_has_org_team_access boolean;
  v_org_id uuid;
  v_most_recent_week date;
BEGIN
  IF p_coach_user_id IS DISTINCT FROM auth.uid()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden: cannot query another user''s roster';
  END IF;

  SELECT
    s.id,
    (COALESCE(s.is_super_admin, false) OR COALESCE(uc.is_platform_admin, false)),
    (COALESCE(s.is_org_admin, false) OR COALESCE(uc.is_org_admin, false)),
    (
      COALESCE(s.is_org_admin, false)
      OR COALESCE(uc.is_org_admin, false)
      OR COALESCE(uc.can_manage_users, false)
      OR COALESCE(uc.can_manage_locations, false)
      OR COALESCE(uc.can_invite_users, false)
      OR COALESCE(uc.can_review_evals, false)
      OR COALESCE(uc.can_manage_assignments, false)
      OR COALESCE(uc.can_manage_library, false)
    ),
    COALESCE(
      s.organization_id,
      pg.organization_id
    )
  INTO
    v_coach_staff_id,
    v_is_super_admin,
    v_is_org_admin,
    v_has_org_team_access,
    v_org_id
  FROM public.staff s
  LEFT JOIN public.user_capabilities uc ON uc.staff_id = s.id
  LEFT JOIN public.locations l ON l.id = s.primary_location_id
  LEFT JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = p_coach_user_id
    AND (
      s.is_coach
      OR s.is_super_admin
      OR s.is_org_admin
      OR s.is_office_manager
      OR COALESCE(uc.is_platform_admin, false)
      OR COALESCE(uc.is_org_admin, false)
      OR COALESCE(uc.can_view_submissions, false)
      OR COALESCE(uc.can_manage_users, false)
      OR COALESCE(uc.can_manage_locations, false)
      OR COALESCE(uc.can_invite_users, false)
      OR COALESCE(uc.can_review_evals, false)
      OR COALESCE(uc.can_manage_assignments, false)
      OR COALESCE(uc.can_manage_library, false)
    )
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  IF p_week_of IS NOT NULL THEN
    v_most_recent_week := date_trunc('week', p_week_of::date)::date;
  ELSE
    SELECT MAX((ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date)
    INTO v_most_recent_week
    FROM public.weekly_scores ws;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    SELECT cs.scope_type, cs.scope_id
    FROM public.coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
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
    FROM public.staff s
    INNER JOIN public.locations l ON l.id = s.primary_location_id
    INNER JOIN public.practice_groups o ON o.id = l.group_id
    LEFT JOIN public.roles r ON r.role_id = s.role_id
    WHERE s.is_participant = true
      AND s.is_org_admin = false
      AND s.is_paused = false
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR (v_has_org_team_access = true AND v_org_id IS NOT NULL AND COALESCE(s.organization_id, o.organization_id) = v_org_id)
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
    COALESCE(opmc.custom_statement, pm.action_statement, opm.action_statement, opmc_sel.custom_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
    COALESCE(c.domain_id, c_sel.domain_id)::bigint AS domain_id,
    COALESCE(d.domain_name, d_sel.domain_name) AS domain_name,
    wa.display_order,
    wa.self_select
  FROM filtered_staff fs
  LEFT JOIN public.weekly_scores ws ON ws.staff_id = fs.id
    AND (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date = v_most_recent_week
  LEFT JOIN public.weekly_assignments wa ON wa.id::text = REPLACE(ws.assignment_id, 'assign:', '')
  LEFT JOIN public.pro_moves pm ON pm.action_id = wa.action_id
  LEFT JOIN public.organization_pro_moves opm ON opm.id = wa.org_move_id
  LEFT JOIN public.organization_pro_move_content_overrides opmc
    ON opmc.org_id = fs.staff_org_id AND opmc.pro_move_id = pm.action_id AND pm.owner_org_id IS NULL
  LEFT JOIN public.pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
  LEFT JOIN public.organization_pro_move_content_overrides opmc_sel
    ON opmc_sel.org_id = fs.staff_org_id AND opmc_sel.pro_move_id = pm_sel.action_id AND pm_sel.owner_org_id IS NULL
  LEFT JOIN public.competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
  LEFT JOIN public.competencies c_sel ON c_sel.competency_id = pm_sel.competency_id
  LEFT JOIN public.domains d ON d.domain_id = c.domain_id
  LEFT JOIN public.domains d_sel ON d_sel.domain_id = c_sel.domain_id
  ORDER BY
    fs.name,
    ws.week_of DESC NULLS LAST,
    ws.performance_date DESC NULLS LAST,
    ws.confidence_date DESC NULLS LAST;
END;
$function$;

DO $$
BEGIN
  RAISE NOTICE 'PML-2b: org content override COALESCE applied to get_my_weekly_scores, get_staff_all_weekly_scores, get_staff_weekly_scores';
END $$;

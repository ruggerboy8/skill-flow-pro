-- Org custom move visibility: teach every assignment-reading view/function to
-- resolve org custom moves (weekly_assignments.org_move_id → organization_pro_moves)
-- alongside platform moves (action_id → pro_moves).
--
-- Pattern applied throughout: LEFT JOIN organization_pro_moves on org_move_id,
-- then COALESCE statement/competency from platform first, org custom second,
-- with wa.competency_id as final fallback (planner-upsert copies it onto the row).
--
-- Must run after 20260612160000 (adds weekly_assignments.org_move_id).
-- Function bases: 20260305215452 (practice_groups rename) except
-- get_staff_weekly_scores, whose base is 20260612155626 (org-admin scope).

-- =====================================================
-- 1. view_weekly_scores_with_competency
-- Same output columns; org moves now resolve competency/domain.
-- =====================================================
CREATE OR REPLACE VIEW public.view_weekly_scores_with_competency AS
SELECT ws.id AS weekly_score_id,
    ws.staff_id,
    ws.weekly_focus_id,
    ws.confidence_score,
    ws.performance_score,
    ws.created_at,
    ws.week_of,
    s.role_id,
    s.primary_location_id,
    l.group_id,
    COALESCE(wf.action_id, wp.action_id, wa.action_id, ws.site_action_id, ws.selected_action_id) AS action_id,
    COALESCE(pm_wf.competency_id, wp.competency_id, wa.competency_id, opm_wa.competency_id, pm_site.competency_id, pm_sel.competency_id) AS competency_id,
    d.domain_id,
    d.domain_name
FROM weekly_scores ws
JOIN staff s ON s.id = ws.staff_id
LEFT JOIN locations l ON l.id = s.primary_location_id
LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
LEFT JOIN pro_moves pm_wf ON pm_wf.action_id = wf.action_id
LEFT JOIN weekly_plan wp ON ('plan:'::text || wp.id) = ws.weekly_focus_id
LEFT JOIN pro_moves pm_wp ON pm_wp.action_id = wp.action_id
LEFT JOIN weekly_assignments wa ON wa.id::text = ws.assignment_id
LEFT JOIN pro_moves pm_wa ON pm_wa.action_id = wa.action_id
LEFT JOIN organization_pro_moves opm_wa ON opm_wa.id = wa.org_move_id
LEFT JOIN pro_moves pm_site ON pm_site.action_id = ws.site_action_id
LEFT JOIN pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
LEFT JOIN competencies c ON c.competency_id = COALESCE(pm_wf.competency_id, pm_wp.competency_id, pm_wa.competency_id, opm_wa.competency_id, wa.competency_id, pm_site.competency_id, pm_sel.competency_id)
LEFT JOIN domains d ON d.domain_id = c.domain_id;

-- =====================================================
-- 2. get_calibration
-- Was INNER JOIN pro_moves: silently excluded org custom assignments.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_calibration(p_staff_id uuid, p_role_id bigint, p_window integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  calibration_data jsonb := '[]'::jsonb;
  domain_record record;
  mean_conf numeric;
  mean_perf numeric;
  mean_delta numeric;
  label_val text;
  data_count int;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  SELECT s.primary_location_id, l.group_id
  INTO location_id_val, org_id_val
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  FOR domain_record IN
    SELECT DISTINCT d.domain_name
    FROM domains d
    JOIN competencies c ON c.domain_id = d.domain_id
    JOIN pro_moves pm ON pm.competency_id = c.competency_id
    WHERE pm.role_id = p_role_id
    ORDER BY d.domain_name
  LOOP
    SELECT
      AVG(ws.confidence_score)::numeric,
      AVG(ws.performance_score)::numeric,
      COUNT(*)
    INTO mean_conf, mean_perf, data_count
    FROM weekly_assignments wa
    JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text)
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
    JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
    JOIN domains d ON d.domain_id = c.domain_id
    WHERE ws.staff_id = p_staff_id
      AND wa.role_id = p_role_id
      AND d.domain_name = domain_record.domain_name
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND wa.status = 'locked'
      AND (
        wa.location_id = location_id_val
        OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );

    IF data_count >= 2 THEN
      mean_delta := mean_perf - mean_conf;
      IF mean_delta >= 0.5 THEN
        label_val := 'under-confident';
      ELSIF mean_delta <= -0.5 THEN
        label_val := 'over-confident';
      ELSE
        label_val := 'well-calibrated';
      END IF;
    ELSE
      mean_delta := NULL;
      label_val := 'Not enough data';
    END IF;

    calibration_data := calibration_data || jsonb_build_object(
      'domain_name', domain_record.domain_name,
      'mean_conf', CASE WHEN mean_conf IS NOT NULL THEN ROUND(mean_conf, 2) ELSE NULL END,
      'mean_perf', CASE WHEN mean_perf IS NOT NULL THEN ROUND(mean_perf, 2) ELSE NULL END,
      'mean_delta', CASE WHEN mean_delta IS NOT NULL THEN ROUND(mean_delta, 2) ELSE NULL END,
      'label', label_val
    );
  END LOOP;

  RETURN calibration_data;
END;
$function$;

-- =====================================================
-- 3. get_performance_trend
-- Was INNER JOIN pro_moves: org custom rows excluded from trend charts.
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_performance_trend(p_staff_id uuid, p_role_id bigint, p_window integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  domain_trends jsonb := '[]'::jsonb;
  domain_record record;
  week_record record;
  points_array jsonb;
  slope_val numeric;
  label_val text;
  x_vals numeric[];
  y_vals numeric[];
  n int;
  sum_x numeric;
  sum_y numeric;
  sum_xy numeric;
  sum_x2 numeric;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  SELECT s.primary_location_id, l.group_id, l.program_start_date, l.cycle_length_weeks
  INTO location_id_val, org_id_val
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  FOR domain_record IN
    SELECT DISTINCT d.domain_name
    FROM domains d
    JOIN competencies c ON c.domain_id = d.domain_id
    JOIN pro_moves pm ON pm.competency_id = c.competency_id
    WHERE pm.role_id = p_role_id
    ORDER BY d.domain_name
  LOOP
    points_array := '[]'::jsonb;
    x_vals := ARRAY[]::numeric[];
    y_vals := ARRAY[]::numeric[];

    FOR week_record IN
      WITH week_calcs AS (
        SELECT
          wa.week_start_date,
          AVG(ws.performance_score) as avg_score,
          CASE
            WHEN ((wa.week_start_date - l.program_start_date) / 7) = 0 THEN 1
            ELSE (((wa.week_start_date - l.program_start_date) / 7) / l.cycle_length_weeks) + 1
          END as cycle,
          CASE
            WHEN ((wa.week_start_date - l.program_start_date) / 7) = 0 THEN 1
            ELSE (((wa.week_start_date - l.program_start_date) / 7) % l.cycle_length_weeks) + 1
          END as week_in_cycle
        FROM weekly_assignments wa
        JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text)
        LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
        LEFT JOIN organization_pro_moves opm ON opm.id = wa.org_move_id
        JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
        JOIN domains d ON d.domain_id = c.domain_id
        LEFT JOIN locations l ON l.id = location_id_val
        WHERE ws.staff_id = p_staff_id
          AND wa.role_id = p_role_id
          AND d.domain_name = domain_record.domain_name
          AND ws.performance_score IS NOT NULL
          AND wa.status = 'locked'
          AND (
            wa.location_id = location_id_val
            OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
            OR (wa.org_id IS NULL AND wa.location_id IS NULL)
          )
        GROUP BY wa.week_start_date, l.program_start_date, l.cycle_length_weeks
      )
      SELECT
        cycle,
        week_in_cycle,
        avg_score,
        cycle || '-' || week_in_cycle as week_key,
        week_start_date
      FROM week_calcs
      ORDER BY week_start_date DESC
      LIMIT p_window
    LOOP
      points_array := jsonb_build_object(
        'week_key', week_record.week_key,
        'value', ROUND(week_record.avg_score::numeric, 2)
      ) || points_array;

      x_vals := array_append(x_vals, array_length(x_vals, 1) + 1);
      y_vals := array_append(y_vals, week_record.avg_score);
    END LOOP;

    n := array_length(x_vals, 1);
    IF n >= 3 THEN
      sum_x := (SELECT SUM(unnest) FROM unnest(x_vals));
      sum_y := (SELECT SUM(unnest) FROM unnest(y_vals));
      sum_xy := (SELECT SUM(x * y) FROM unnest(x_vals) WITH ORDINALITY AS t1(x, i) JOIN unnest(y_vals) WITH ORDINALITY AS t2(y, j) ON i = j);
      sum_x2 := (SELECT SUM(x * x) FROM unnest(x_vals) AS x);

      slope_val := (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);

      IF slope_val >= 0.25 THEN
        label_val := 'Improving';
      ELSIF slope_val <= -0.25 THEN
        label_val := 'Declining';
      ELSE
        label_val := 'Holding steady';
      END IF;
    ELSE
      slope_val := 0;
      label_val := 'Not enough data';
    END IF;

    domain_trends := domain_trends || jsonb_build_object(
      'domain_name', domain_record.domain_name,
      'points', points_array,
      'slope', ROUND(slope_val, 3),
      'label', label_val
    );
  END LOOP;

  RETURN domain_trends;
END;
$function$;

-- =====================================================
-- 4. get_my_weekly_scores
-- Org custom rows showed NULL action_statement (pro_moves-only lookup).
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
      s.participation_start_at
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
    COALESCE(pm.action_statement, opm.action_statement) AS action_statement,
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
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY s.week_start_date DESC, COALESCE(pm.action_statement, opm.action_statement);
END;
$function$;

-- =====================================================
-- 5. get_staff_all_weekly_scores
-- Org custom rows had blank statement and NULL domain (pro_moves-only joins).
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
      COALESCE(wa.action_id, wf.action_id) AS action_id,
      COALESCE(pm_wa.action_statement, opm_wa.action_statement, pm_wf.action_statement) AS action_statement,
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
    LEFT JOIN competencies c_wa ON c_wa.competency_id = COALESCE(pm_wa.competency_id, opm_wa.competency_id, wa.competency_id)
    LEFT JOIN domains d_wa ON c_wa.domain_id = d_wa.domain_id
    LEFT JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id::text AND ws.assignment_id IS NULL
    LEFT JOIN pro_moves pm_wf ON wf.action_id = pm_wf.action_id
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
-- 6. get_staff_weekly_scores
-- Base: 20260612155626 (keeps the org-admin scope addition).
-- Org custom rows showed 'Self-Select' with no domain in coach view.
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
      o.name AS group_name
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
    COALESCE(pm.action_statement, opm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
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
-- 7. get_staff_week_assignments
-- Staff weekly RPC: org custom rows showed 'Self-Select' / 'General'.
-- Adds org_move_id to the payload for frontend use.
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
        'action_statement', COALESCE(pm.action_statement, opm.action_statement, 'Self-Select'),
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
          'action_statement', COALESCE(pm.action_statement, opm.action_statement, 'Self-Select'),
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
            'action_statement', COALESCE(pm.action_statement, opm.action_statement, 'Self-Select'),
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

-- Sanity check: dependency column must exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weekly_assignments'
      AND column_name = 'org_move_id'
  ) THEN
    RAISE EXCEPTION 'weekly_assignments.org_move_id missing — run 20260612160000 first';
  END IF;
  RAISE NOTICE 'org move visibility functions updated successfully';
END $$;

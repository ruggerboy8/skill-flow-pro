-- SEC-2 batch B: add in-body caller-scope checks to SECURITY DEFINER functions.
--
-- Batch A (fix/sec-2a-lock-anon-functions, not yet merged) revokes anon/PUBLIC
-- EXECUTE on these functions. That closes the "no login required" hole but
-- leaves a second one open: an authenticated caller can still pass a
-- foreign staff id, org id, location id, or coach user id and read (or in
-- one case write) another tenant's data, because the function bodies never
-- checked that the id belonged to the caller. This migration adds that
-- check inside each function body. It does not touch grants (batch A) and
-- does not change any query logic, return type, signature, or the
-- SECURITY DEFINER setting of any function -- every statement below is
-- CREATE OR REPLACE with the guard prepended to the existing body,
-- verbatim otherwise.
--
-- Idempotent: CREATE OR REPLACE is safe to re-run.
-- Not applied by this branch. Read-only MCP was used to fetch the exact
-- live definitions before writing this file. Application to the database
-- is a later, supervised step.

select set_config('app.change_reason', 'batch: SEC-2b add in-body caller-scope checks to SECURITY DEFINER functions', true);

-- ============================================================================
-- 1. get_staff_weekly_scores(uuid, text)
--    p_coach_user_id is meant to be the caller's own identity, but the body
--    never checked that. Any authenticated user could pass another coach's
--    user id and read that coach's whole roster. Guard: the id must equal
--    the caller's own auth.uid(), unless the caller is a super admin.
-- ============================================================================

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
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
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
      o.name AS group_name
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
    COALESCE(pm.action_statement, opm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
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
  LEFT JOIN public.pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
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

-- ============================================================================
-- 2. save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text) -- 4-arg
--    Writes staff_quarter_focus rows and updates the evaluation with no
--    caller check at all. Guard ported verbatim from the 2-arg overload
--    (save_eval_acknowledgement_and_focus(uuid, integer[]), left untouched):
--    the caller must resolve to a staff row, must own the eval
--    (eval.staff_id = caller.id) or be a super admin, and the eval must be
--    visible to staff. The 2-arg overload is NOT modified by this migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_eval_acknowledgement_and_focus(p_eval_id uuid, p_staff_id uuid, p_action_ids integer[], p_learner_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_eval.is_visible_to_staff THEN RAISE EXCEPTION 'Evaluation not visible'; END IF;

  -- Update evaluation
  UPDATE evaluations
  SET acknowledged_at = COALESCE(acknowledged_at, now()),
      focus_selected_at = COALESCE(focus_selected_at, now()),
      learner_note = COALESCE(p_learner_note, evaluations.learner_note)
  WHERE id = p_eval_id;

  -- Delete existing focus rows for this eval
  DELETE FROM staff_quarter_focus
  WHERE evaluation_id = p_eval_id AND staff_id = p_staff_id;

  -- Insert new focus rows
  INSERT INTO staff_quarter_focus (evaluation_id, staff_id, action_id)
  SELECT p_eval_id, p_staff_id, unnest(p_action_ids);
END;
$function$;

-- ============================================================================
-- Group 1 readers: each takes a staff id, org id, or location id argument
-- and returns scores/evaluation data with no org check. Guard style copied
-- from the existing public.get_staff_domain_avgs function (RAISE EXCEPTION
-- 'forbidden' after an IF ... THEN check): compare the scoping argument's
-- org to the caller's org via org_id_of_staff / org_id_of_location /
-- current_user_org_id, allowing super admins through.
-- ============================================================================

-- 3. get_calibration(uuid, bigint, integer) -- scoping arg: p_staff_id
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
  IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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

-- 4. get_performance_trend(uuid, bigint, integer) -- scoping arg: p_staff_id
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
  IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

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

-- 5. get_best_weekly_win(uuid) -- scoping arg: p_staff_id
CREATE OR REPLACE FUNCTION public.get_best_weekly_win(p_staff_id uuid)
 RETURNS TABLE(out_week_of text, out_action_statement text, out_domain_name text, out_lift_amount integer, out_win_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH week_scores AS (
    SELECT
      ws.week_of,
      COALESCE(pm.action_statement, 'Self-Select') as action_statement,
      COALESCE(d.domain_name, 'General') as domain_name,
      ws.confidence_score,
      ws.performance_score,
      (ws.performance_score - ws.confidence_score) as lift
    FROM weekly_scores ws
    LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(ws.site_action_id, ws.selected_action_id)
    LEFT JOIN competencies c ON c.competency_id = pm.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE ws.staff_id = p_staff_id
      AND ws.week_of IS NOT NULL
      AND ws.week_of >= CURRENT_DATE - INTERVAL '4 weeks'
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND pm.action_statement IS NOT NULL
  ),
  perfect_weeks AS (
    SELECT
      week_of,
      MIN(action_statement) as action_statement,
      MIN(domain_name) as domain_name,
      0 as lift_amount,
      'perfect' as win_type,
      1 as priority
    FROM week_scores
    GROUP BY week_of
    HAVING bool_and(performance_score = 4)
    ORDER BY week_of DESC
    LIMIT 1
  ),
  growth_weeks AS (
    SELECT
      week_of,
      action_statement,
      domain_name,
      lift as lift_amount,
      'growth' as win_type,
      2 as priority
    FROM week_scores
    WHERE lift >= 1
    ORDER BY lift DESC, week_of DESC
    LIMIT 1
  ),
  all_wins AS (
    SELECT * FROM perfect_weeks
    UNION ALL
    SELECT * FROM growth_weeks
  )
  SELECT
    aw.week_of::text,
    aw.action_statement,
    aw.domain_name,
    aw.lift_amount,
    aw.win_type
  FROM all_wins aw
  ORDER BY aw.priority
  LIMIT 1;
END;
$function$;

-- 6. get_evaluations_summary(uuid) -- 1-arg overload, scoping arg: p_staff_id
CREATE OR REPLACE FUNCTION public.get_evaluations_summary(p_staff_id uuid)
 RETURNS TABLE(eval_id uuid, submitted_at timestamp with time zone, status text, type text, quarter text, program_year integer, domain_name text, avg_self numeric, avg_observer numeric, delta numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.id as eval_id,
    e.updated_at as submitted_at,
    e.status,
    e.type,
    e.quarter,
    e.program_year,
    ei.domain_name,
    ROUND(AVG(ei.self_score)::numeric, 1) as avg_self,
    ROUND(AVG(ei.observer_score)::numeric, 1) as avg_observer,
    ROUND((AVG(ei.observer_score) - AVG(ei.self_score))::numeric, 1) as delta
  FROM evaluations e
  JOIN evaluation_items ei ON ei.evaluation_id = e.id
  WHERE e.staff_id = p_staff_id
    AND ei.domain_name IS NOT NULL
    AND (ei.self_score IS NOT NULL OR ei.observer_score IS NOT NULL)
  GROUP BY e.id, e.updated_at, e.status, e.type, e.quarter, e.program_year, ei.domain_name
  ORDER BY e.updated_at DESC, ei.domain_name;
END;
$function$;

-- 7. get_evaluations_summary(uuid, boolean) -- 2-arg overload, scoping arg: p_staff_id
CREATE OR REPLACE FUNCTION public.get_evaluations_summary(p_staff_id uuid, p_only_submitted boolean DEFAULT true)
 RETURNS TABLE(eval_id uuid, submitted_at timestamp with time zone, status text, type text, quarter text, program_year integer, domain_name text, avg_self numeric, avg_observer numeric, delta numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
     AND NOT EXISTS (
       SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.id as eval_id,
    e.updated_at as submitted_at,
    e.status,
    e.type,
    e.quarter,
    e.program_year,
    COALESCE(ei.domain_name, 'General') as domain_name,
    ROUND(AVG(ei.self_score)::numeric, 1) as avg_self,
    ROUND(AVG(ei.observer_score)::numeric, 1) as avg_observer,
    ROUND((AVG(ei.observer_score) - AVG(ei.self_score))::numeric, 1) as delta
  FROM evaluations e
  JOIN evaluation_items ei ON ei.evaluation_id = e.id
  WHERE e.staff_id = p_staff_id
    AND (NOT p_only_submitted OR e.status = 'submitted')
    AND (ei.self_score IS NOT NULL OR ei.observer_score IS NOT NULL)
  GROUP BY e.id, e.updated_at, e.status, e.type, e.quarter, e.program_year, COALESCE(ei.domain_name, 'General')
  ORDER BY e.updated_at DESC, COALESCE(ei.domain_name, 'General');
END;
$function$;

-- 8. get_location_domain_staff_averages(uuid, ...) -- scoping arg: p_org_id
CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_include_no_eval boolean DEFAULT false, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(location_id uuid, location_name text, staff_id uuid, staff_name text, role_id integer, role_name text, domain_id integer, domain_name text, n_items bigint, avg_observer numeric, avg_self numeric, eval_status text, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org_id IS DISTINCT FROM public.current_user_org_id()
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

-- 9. get_eval_distribution_metrics(uuid, ...) -- scoping arg: p_org_id
--    NOTE: this function's original definition has no `SET search_path`
--    clause (unlike its siblings), so the guard below schema-qualifies
--    public.staff / public.current_user_org_id explicitly rather than
--    relying on session search_path.
CREATE OR REPLACE FUNCTION public.get_eval_distribution_metrics(p_org_id uuid, p_types text[], p_program_year integer, p_quarter text DEFAULT NULL::text, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(location_id uuid, location_name text, domain_id bigint, domain_name text, role_id integer, role_name text, staff_id uuid, staff_name text, evaluation_id uuid, evaluation_status text, n_items integer, obs_top_box integer, obs_bottom_box integer, self_top_box integer, self_bottom_box integer, mismatch_count integer, obs_mean numeric, self_mean numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  IF p_org_id IS DISTINCT FROM public.current_user_org_id()
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

-- 10. seq_latest_quarterly_evals(uuid, bigint) -- 2-arg overload, scoping arg: p_org_id
--     The 1-arg overload, seq_latest_quarterly_evals(integer), is deliberately
--     left out of this migration -- see scripts/sec-verification/sec2b-README.md.
CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(p_org_id uuid, p_role_id bigint)
 RETURNS TABLE(competency_id bigint, score01 numeric, effective_date text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org_id IS DISTINCT FROM public.current_user_org_id()
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
-- Sanity check: existence + SECURITY DEFINER only. Runtime behavior under
-- different calling roles cannot be asserted from plain SQL in a migration
-- (that needs calling these as different auth contexts, done in the
-- supervised apply step / manual QA), so this only confirms the replace
-- didn't drop or de-secure any of the ten guarded signatures.
-- ============================================================================

DO $$
DECLARE
  v_missing text := '';
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_staff_weekly_scores(uuid, text)',
    'public.save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)',
    'public.get_calibration(uuid, bigint, integer)',
    'public.get_performance_trend(uuid, bigint, integer)',
    'public.get_best_weekly_win(uuid)',
    'public.get_evaluations_summary(uuid)',
    'public.get_evaluations_summary(uuid, boolean)',
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
    RAISE EXCEPTION 'SEC-2b sanity check failed, not SECURITY DEFINER or missing: %', v_missing;
  END IF;
END $$;

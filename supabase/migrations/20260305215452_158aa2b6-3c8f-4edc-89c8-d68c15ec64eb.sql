
-- =====================================================
-- Migration: Rename organizations → practice_groups
-- Renames table, FK column on locations, views, functions
-- =====================================================

-- STEP 1: Drop functions whose RETURNS TABLE types change
DROP FUNCTION IF EXISTS public.get_coach_roster_summary(uuid, date);
DROP FUNCTION IF EXISTS public.get_my_weekly_scores(text);
DROP FUNCTION IF EXISTS public.get_staff_all_weekly_scores(uuid);
DROP FUNCTION IF EXISTS public.get_staff_weekly_scores(uuid, text);

-- STEP 2: Drop views that need output column name changes
DROP VIEW IF EXISTS public.view_evaluation_items_enriched;
DROP VIEW IF EXISTS public.view_weekly_scores_with_competency;

-- STEP 3: Rename table and column
ALTER TABLE public.organizations RENAME TO practice_groups;
ALTER TABLE public.locations RENAME COLUMN organization_id TO group_id;

-- STEP 4: Recreate views with updated column names

CREATE VIEW public.view_evaluation_items_enriched AS
SELECT e.id AS evaluation_id,
    e.type AS evaluation_type,
    e.quarter,
    e.program_year,
    e.created_at AS evaluation_at,
    subj.id AS staff_id,
    subj.name AS staff_name,
    subj.role_id,
    subj.primary_location_id,
    COALESCE(loc.name, 'Unknown Location'::text) AS location_name,
    loc.group_id,
    ei.competency_id,
    c.domain_id,
    COALESCE(d.domain_name, 'Unassigned'::text) AS domain_name,
    ei.observer_score,
    ei.self_score
FROM evaluation_items ei
JOIN evaluations e ON e.id = ei.evaluation_id
JOIN staff subj ON subj.id = e.staff_id
LEFT JOIN locations loc ON loc.id = subj.primary_location_id
LEFT JOIN competencies c ON c.competency_id = ei.competency_id
LEFT JOIN domains d ON d.domain_id = c.domain_id;

CREATE VIEW public.view_weekly_scores_with_competency AS
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
    COALESCE(pm_wf.competency_id, wp.competency_id, wa.competency_id, pm_site.competency_id, pm_sel.competency_id) AS competency_id,
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
LEFT JOIN pro_moves pm_site ON pm_site.action_id = ws.site_action_id
LEFT JOIN pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
LEFT JOIN competencies c ON c.competency_id = COALESCE(pm_wf.competency_id, pm_wp.competency_id, pm_wa.competency_id, pm_site.competency_id, pm_sel.competency_id)
LEFT JOIN domains d ON d.domain_id = c.domain_id;

-- =====================================================
-- STEP 5: Recreate/update all affected functions
-- =====================================================

-- 5.1 compare_conf_perf_to_eval
CREATE OR REPLACE FUNCTION public.compare_conf_perf_to_eval(p_org_id uuid, p_window_days integer DEFAULT 42, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(evaluation_id uuid, staff_id uuid, primary_location_id uuid, competency_id bigint, competency_name text, domain_id bigint, domain_name text, eval_observer_avg numeric, eval_self_avg numeric, conf_avg numeric, perf_avg numeric, framework text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH evals AS (
    SELECT v.*, c.name as competency_name,
           CASE 
             WHEN c.code LIKE 'DFI.%' THEN 'DFI'
             WHEN c.code LIKE 'RDA.%' THEN 'RDA'
             ELSE NULL
           END as framework
    FROM view_evaluation_items_enriched v
    LEFT JOIN competencies c ON c.competency_id = v.competency_id
    WHERE v.group_id = p_org_id
      AND (p_location_ids IS NULL OR v.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR v.role_id            = ANY(p_role_ids))
      AND (p_types        IS NULL OR v.evaluation_type    = ANY(p_types))
      AND (p_start IS NULL OR v.evaluation_at >= p_start)
      AND (p_end   IS NULL OR v.evaluation_at <  p_end)
      AND v.competency_id IS NOT NULL
  ),
  ws_window AS (
    SELECT
      e.evaluation_id,
      w.staff_id,
      w.competency_id,
      w.domain_id,
      w.domain_name,
      ROUND(AVG(w.confidence_score) FILTER (WHERE w.confidence_score IS NOT NULL)::numeric, 2) AS conf_avg,
      ROUND(AVG(w.performance_score) FILTER (WHERE w.performance_score IS NOT NULL)::numeric, 2) AS perf_avg
    FROM evals e
    JOIN view_weekly_scores_with_competency w
      ON w.staff_id = e.staff_id
     AND w.competency_id = e.competency_id
     AND w.group_id = p_org_id
     AND w.created_at >= (e.evaluation_at - MAKE_INTERVAL(days => p_window_days))
     AND w.created_at <   e.evaluation_at
    GROUP BY e.evaluation_id, w.staff_id, w.competency_id, w.domain_id, w.domain_name
  )
  SELECT
    e.evaluation_id,
    e.staff_id,
    e.primary_location_id,
    e.competency_id,
    e.competency_name,
    e.domain_id,
    e.domain_name,
    ROUND(AVG(e.observer_score)::numeric, 2) AS eval_observer_avg,
    ROUND(AVG(e.self_score)::numeric, 2) AS eval_self_avg,
    w.conf_avg,
    w.perf_avg,
    e.framework
  FROM evals e
  LEFT JOIN ws_window w
    ON w.evaluation_id = e.evaluation_id
   AND w.competency_id = e.competency_id
  GROUP BY e.evaluation_id, e.staff_id, e.primary_location_id,
           e.competency_id, e.competency_name, e.domain_id, e.domain_name, w.conf_avg, w.perf_avg, e.framework
  ORDER BY e.domain_id, e.competency_name;
END;
$function$;

-- 5.2 get_calibration
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
    JOIN pro_moves pm ON pm.action_id = wa.action_id
    JOIN competencies c ON c.competency_id = pm.competency_id
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

-- 5.3 get_coach_roster_summary (recreate with new return type)
CREATE FUNCTION public.get_coach_roster_summary(p_coach_user_id uuid, p_week_start date DEFAULT NULL::date)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, active_monday date, required_count integer, conf_submitted_count integer, conf_late_count integer, perf_submitted_count integer, perf_late_count integer, backlog_count integer, last_conf_at timestamp with time zone, last_perf_at timestamp with time zone, tz text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date;
  v_coach_staff_id uuid;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_week_start := date_trunc('week', COALESCE(p_week_start, (NOW() AT TIME ZONE 'America/Chicago')::date))::date;

  SELECT s.id, s.coach_scope_type, s.coach_scope_id, s.is_super_admin
  INTO v_coach_staff_id, v_coach_scope_type, v_coach_scope_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_lead OR s.is_super_admin OR s.is_org_admin)
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
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
      AND (wa.org_id IS NULL OR wa.org_id = (SELECT l2.group_id FROM locations l2 WHERE l2.id = st.primary_location_id))
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
  staff_backlog AS (
    SELECT
      ub.staff_id,
      COUNT(*) AS backlog_count
    FROM user_backlog_v2 ub
    WHERE ub.resolved_on IS NULL
    GROUP BY ub.staff_id
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
    COALESCE(sb.backlog_count, 0)::int AS backlog_count,
    sa.last_conf_at,
    sa.last_perf_at,
    l.timezone AS tz
  FROM visible_staff vs
  INNER JOIN staff s ON s.id = vs.staff_id
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN practice_groups o ON o.id = l.group_id
  LEFT JOIN staff_aggregates sa ON sa.staff_id = s.id
  LEFT JOIN staff_backlog sb ON sb.staff_id = s.id
  ORDER BY s.name;
END;
$function$;

-- 5.4 get_consistency
CREATE OR REPLACE FUNCTION public.get_consistency(p_staff_id uuid, p_weeks integer DEFAULT 6, p_tz text DEFAULT 'America/Chicago'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  staff_record record;
  week_record record;
  result jsonb;
  on_time_count int := 0;
  late_count int := 0;
  streak int := 0;
  weeks_array jsonb := '[]'::jsonb;
  current_date_calc date;
  week_start date;
  conf_status text;
  perf_status text;
  week_data jsonb;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  SELECT s.*, l.timezone, l.program_start_date, l.cycle_length_weeks, s.primary_location_id, l.group_id
  INTO staff_record
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'on_time_count', 0,
      'late_count', 0,
      'streak', 0,
      'weeks', '[]'::jsonb
    );
  END IF;
  
  location_id_val := staff_record.primary_location_id;
  org_id_val := staff_record.group_id;
  current_date_calc := (now() AT TIME ZONE COALESCE(p_tz, staff_record.timezone, 'America/Chicago'))::date;
  
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    week_start := current_date_calc - ((EXTRACT(DOW FROM current_date_calc)::int + 6) % 7) - (i * 7);
    
    SELECT 
      ((week_start - staff_record.program_start_date)::int / 7 / staff_record.cycle_length_weeks) + 1 as cycle,
      (((week_start - staff_record.program_start_date)::int / 7) % staff_record.cycle_length_weeks) + 1 as week_in_cycle
    INTO week_record;
    
    conf_status := 'missing';
    perf_status := 'missing';
    
    SELECT 
      CASE 
        WHEN COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL) = 0 THEN 'missing'
        WHEN COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL AND ws.confidence_date <= (week_start + INTERVAL '1 day' + INTERVAL '12 hours')) = COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL) THEN 'on_time'
        ELSE 'late'
      END as conf_st,
      CASE 
        WHEN COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL) = 0 THEN 'missing'
        WHEN COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL AND ws.performance_date <= (week_start + INTERVAL '4 days' + INTERVAL '17 hours')) = COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL) THEN 'on_time'
        ELSE 'late'
      END as perf_st
    INTO conf_status, perf_status
    FROM weekly_assignments wa
    LEFT JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text) AND ws.staff_id = p_staff_id
    WHERE wa.week_start_date = week_start
      AND wa.role_id = staff_record.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = location_id_val
        OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );
    
    week_data := jsonb_build_object(
      'cycle', week_record.cycle,
      'week_in_cycle', week_record.week_in_cycle,
      'conf_status', conf_status,
      'perf_status', perf_status,
      'conf_ts', null,
      'perf_ts', null
    );
    
    weeks_array := weeks_array || week_data;
    
    IF conf_status = 'on_time' AND perf_status = 'on_time' THEN
      on_time_count := on_time_count + 1;
    ELSIF (conf_status = 'late' OR perf_status = 'late') AND conf_status != 'missing' AND perf_status != 'missing' THEN
      late_count := late_count + 1;
    END IF;
  END LOOP;
  
  FOR i IN REVERSE (jsonb_array_length(weeks_array) - 1)..0 LOOP
    week_data := weeks_array->i;
    IF (week_data->>'conf_status') = 'on_time' AND (week_data->>'perf_status') = 'on_time' THEN
      streak := streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'on_time_count', on_time_count,
    'late_count', late_count,
    'streak', streak,
    'weeks', weeks_array
  );
END;
$function$;

-- 5.5 get_eval_distribution_metrics
CREATE OR REPLACE FUNCTION public.get_eval_distribution_metrics(p_org_id uuid, p_types text[], p_program_year integer, p_quarter text DEFAULT NULL::text, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(location_id uuid, location_name text, domain_id bigint, domain_name text, role_id integer, role_name text, staff_id uuid, staff_name text, evaluation_id uuid, evaluation_status text, n_items integer, obs_top_box integer, obs_bottom_box integer, self_top_box integer, self_bottom_box integer, mismatch_count integer, obs_mean numeric, self_mean numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
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

-- 5.6 get_location_domain_staff_averages
CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_include_no_eval boolean DEFAULT false, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(location_id uuid, location_name text, staff_id uuid, staff_name text, role_id integer, role_name text, domain_id integer, domain_name text, n_items bigint, avg_observer numeric, avg_self numeric, eval_status text, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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

-- 5.7 get_my_weekly_scores (recreate with new return type)
CREATE FUNCTION public.get_my_weekly_scores(p_week_of text DEFAULT NULL::text)
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
    pm.action_statement,
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
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY s.week_start_date DESC, pm.action_statement;
END;
$function$;

-- 5.8 get_performance_trend
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
        JOIN pro_moves pm ON pm.action_id = wa.action_id
        JOIN competencies c ON c.competency_id = pm.competency_id
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

-- 5.9 get_staff_all_weekly_scores (recreate with new return type)
CREATE FUNCTION public.get_staff_all_weekly_scores(p_staff_id uuid)
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
      COALESCE(pm_wa.action_statement, pm_wf.action_statement) AS action_statement,
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
    LEFT JOIN competencies c_wa ON pm_wa.competency_id = c_wa.competency_id
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
      pm.action_statement,
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
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
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

-- 5.10 get_staff_domain_avgs
CREATE OR REPLACE FUNCTION public.get_staff_domain_avgs(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_eval_types text[] DEFAULT NULL::text[], p_include_no_eval boolean DEFAULT false)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id integer, location_id uuid, location_name text, domain_id integer, domain_name text, observer_avg numeric, self_avg numeric, n_items integer, last_eval_at timestamp with time zone, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base_staff AS (
    SELECT 
      s.id as staff_id, 
      s.name as staff_name, 
      s.role_id::int as role_id, 
      s.primary_location_id as location_id
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    WHERE l.group_id = p_org_id
      AND s.is_org_admin = false
      AND (p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR array_length(p_role_ids, 1) IS NULL OR s.role_id = ANY(p_role_ids))
  ),
  evals_in_range AS (
    SELECT e.id as evaluation_id, e.staff_id, e.updated_at as evaluated_at, e.type
    FROM evaluations e
    WHERE e.updated_at >= p_start AND e.updated_at < p_end
      AND (p_eval_types IS NULL OR array_length(p_eval_types, 1) IS NULL OR e.type = ANY(p_eval_types))
      AND e.status = 'submitted'
  ),
  items AS (
    SELECT
      e.staff_id,
      d.domain_id::int as domain_id,
      d.domain_name,
      i.observer_score,
      i.self_score,
      e.evaluated_at
    FROM evaluation_items i
    JOIN evals_in_range e ON e.evaluation_id = i.evaluation_id
    LEFT JOIN competencies c ON c.competency_id = i.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE d.domain_id IS NOT NULL
  ),
  agg AS (
    SELECT
      i.staff_id,
      i.domain_id,
      i.domain_name,
      ROUND(AVG(i.observer_score)::numeric, 1) as observer_avg,
      ROUND(AVG(i.self_score)::numeric, 1) as self_avg,
      COUNT(*)::int as n_items,
      MAX(i.evaluated_at) as last_eval_at
    FROM items i
    GROUP BY i.staff_id, i.domain_id, i.domain_name
  )
  SELECT
    bs.staff_id,
    bs.staff_name,
    bs.role_id::int,
    bs.location_id,
    l.name as location_name,
    a.domain_id::int,
    a.domain_name,
    a.observer_avg,
    a.self_avg,
    a.n_items,
    a.last_eval_at,
    (a.staff_id IS NOT NULL) as has_eval
  FROM base_staff bs
  JOIN locations l ON l.id = bs.location_id
  LEFT JOIN agg a ON a.staff_id = bs.staff_id
  WHERE p_include_no_eval IS TRUE OR a.staff_id IS NOT NULL
  ORDER BY l.name, bs.staff_name, a.domain_name NULLS LAST;
END;
$function$;

-- 5.11 get_staff_domain_competencies
CREATE OR REPLACE FUNCTION public.get_staff_domain_competencies(p_org_id uuid, p_staff_id uuid, p_domain_id bigint, p_start timestamp with time zone, p_end timestamp with time zone, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_eval_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(competency_id bigint, competency_name text, framework text, observer_avg numeric, self_avg numeric, n_items integer, last_eval_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH evals_in_range AS (
    SELECT e.id as evaluation_id, e.staff_id, e.updated_at as evaluated_at, e.type
    FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    JOIN locations l ON l.id = s.primary_location_id
    WHERE e.staff_id = p_staff_id
      AND l.group_id = p_org_id
      AND e.updated_at >= p_start AND e.updated_at < p_end
      AND (p_eval_types IS NULL OR array_length(p_eval_types, 1) IS NULL OR e.type = ANY(p_eval_types))
      AND (p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR array_length(p_role_ids, 1) IS NULL OR s.role_id = ANY(p_role_ids))
      AND e.status = 'submitted'
  ),
  items AS (
    SELECT
      i.competency_id,
      c.name as competency_name,
      CASE 
        WHEN c.code LIKE 'DFI.%' THEN 'DFI'
        WHEN c.code LIKE 'RDA.%' THEN 'RDA'
        ELSE NULL
      END as framework,
      i.observer_score,
      i.self_score,
      e.evaluated_at
    FROM evaluation_items i
    JOIN evals_in_range e ON e.evaluation_id = i.evaluation_id
    LEFT JOIN competencies c ON c.competency_id = i.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE d.domain_id = p_domain_id
      AND i.competency_id IS NOT NULL
  )
  SELECT
    items.competency_id,
    items.competency_name,
    items.framework,
    ROUND(AVG(items.observer_score)::numeric, 1) as observer_avg,
    ROUND(AVG(items.self_score)::numeric, 1) as self_avg,
    COUNT(*)::int as n_items,
    MAX(items.evaluated_at) as last_eval_at
  FROM items
  GROUP BY items.competency_id, items.competency_name, items.framework
  ORDER BY items.competency_id;
END;
$function$;

-- 5.12 get_staff_week_assignments
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
        'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
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
        'competency_id', COALESCE(pm.competency_id, wa.competency_id),
        'action_id', wa.action_id
      ) ORDER BY wa.display_order
    ) INTO v_assignments
    FROM weekly_assignments wa
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
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
          'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
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
          'competency_id', COALESCE(pm.competency_id, wa.competency_id),
          'action_id', wa.action_id
        ) ORDER BY wa.display_order
      ) INTO v_assignments
      FROM weekly_assignments wa
      LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
      LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
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
            'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
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
            'competency_id', COALESCE(pm.competency_id, wa.competency_id),
            'action_id', wa.action_id
          ) ORDER BY wa.display_order
        ) INTO v_assignments
        FROM weekly_assignments wa
        LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
        LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
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

-- 5.13 get_staff_weekly_scores (recreate with new return type)
CREATE FUNCTION public.get_staff_weekly_scores(p_coach_user_id uuid, p_week_of text DEFAULT NULL::text)
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
  v_most_recent_week date;
BEGIN
  SELECT s.id, s.coach_scope_type, s.coach_scope_id, s.is_super_admin, s.is_org_admin
  INTO v_coach_staff_id, v_coach_scope_type, v_coach_scope_id, v_is_super_admin, v_is_org_admin
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
    COALESCE(pm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
    COALESCE(c.domain_id, c_sel.domain_id)::bigint AS domain_id,
    COALESCE(d.domain_name, d_sel.domain_name) AS domain_name,
    wa.display_order,
    wa.self_select
  FROM filtered_staff fs
  LEFT JOIN weekly_scores ws ON ws.staff_id = fs.id
    AND (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date = v_most_recent_week
  LEFT JOIN weekly_assignments wa ON wa.id::text = REPLACE(ws.assignment_id, 'assign:', '')
  LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
  LEFT JOIN pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
  LEFT JOIN competencies c ON c.competency_id = pm.competency_id
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

-- 5.14 get_strengths_weaknesses
CREATE OR REPLACE FUNCTION public.get_strengths_weaknesses(p_org_id uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(level text, id bigint, name text, n_items integer, avg_observer numeric, domain_id bigint, domain_name text, framework text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT *
    FROM view_evaluation_items_enriched v
    WHERE v.group_id = p_org_id
      AND (p_location_ids IS NULL OR v.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR v.role_id            = ANY(p_role_ids))
      AND (p_types        IS NULL OR v.evaluation_type    = ANY(p_types))
      AND (p_start IS NULL OR v.evaluation_at >= p_start)
      AND (p_end   IS NULL OR v.evaluation_at <  p_end)
      AND v.observer_score IS NOT NULL
  ),
  domain_results AS (
    SELECT 
      'domain'::text as level, 
      b.domain_id as id, 
      b.domain_name as name, 
      COUNT(*)::int as n_items, 
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      NULL::text as framework
    FROM base b
    WHERE b.domain_id IS NOT NULL
    GROUP BY b.domain_id, b.domain_name
  ),
  competency_results AS (
    SELECT 
      'competency'::text as level, 
      b.competency_id as id, 
      c.name as name,
      COUNT(*)::int as n_items, 
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      CASE 
        WHEN c.code LIKE 'DFI.%' THEN 'DFI'
        WHEN c.code LIKE 'RDA.%' THEN 'RDA'
        ELSE NULL
      END as framework
    FROM base b
    LEFT JOIN competencies c ON c.competency_id = b.competency_id
    WHERE b.competency_id IS NOT NULL
    GROUP BY b.competency_id, c.name, b.domain_id, b.domain_name, c.code
  )
  SELECT dr.level, dr.id, dr.name, dr.n_items, dr.avg_observer, dr.domain_id, dr.domain_name, dr.framework FROM domain_results dr
  UNION ALL
  SELECT cr.level, cr.id, cr.name, cr.n_items, cr.avg_observer, cr.domain_id, cr.domain_name, cr.framework FROM competency_results cr
  ORDER BY domain_id, level, avg_observer DESC;
END;
$function$;

-- 5.15 is_org_allowed_for_sequencing
CREATE OR REPLACE FUNCTION public.is_org_allowed_for_sequencing(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE 
    WHEN p_org_id IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.practice_groups o
      WHERE o.id = p_org_id 
        AND o.active = true
    )
  END;
$function$;

-- 5.16 seq_confidence_history_18w
CREATE OR REPLACE FUNCTION public.seq_confidence_history_18w(p_org_id uuid, p_role_id bigint, p_tz text, p_effective_date timestamp with time zone)
 RETURNS TABLE(pro_move_id bigint, week_start text, avg01 numeric, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    wf.action_id AS pro_move_id,
    TO_CHAR(DATE_TRUNC('week', ws.confidence_date AT TIME ZONE p_tz)::date, 'YYYY-MM-DD') AS week_start,
    AVG(ws.confidence_score / 10.0) AS avg01,
    COUNT(*) AS n
  FROM weekly_scores ws
  JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.group_id = p_org_id
    AND wf.role_id = p_role_id
    AND (ws.confidence_date AT TIME ZONE p_tz) >= (p_effective_date AT TIME ZONE p_tz) - INTERVAL '18 weeks'
    AND ws.confidence_score IS NOT NULL
  GROUP BY wf.action_id, DATE_TRUNC('week', ws.confidence_date AT TIME ZONE p_tz)
  ORDER BY wf.action_id, week_start;
END;
$function$;

-- 5.17 seq_latest_quarterly_evals
CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(p_org_id uuid, p_role_id bigint)
 RETURNS TABLE(competency_id bigint, score01 numeric, effective_date text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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

-- 5.18 update_staff_location_organization (trigger function)
CREATE OR REPLACE FUNCTION public.update_staff_location_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.primary_location_id IS NOT NULL THEN
    SELECT l.name, o.name
    INTO NEW.location, NEW.organization
    FROM locations l
    JOIN practice_groups o ON o.id = l.group_id
    WHERE l.id = NEW.primary_location_id;
  ELSE
    NEW.location := NULL;
    NEW.organization := NULL;
  END IF;
  
  RETURN NEW;
END;
$function$;

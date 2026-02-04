
-- Phase 1: Exclude paused users from data aggregations
-- This migration adds is_paused = false filters to:
-- 1. view_staff_submission_windows
-- 2. get_staff_weekly_scores RPC
-- 3. get_location_domain_staff_averages RPC

-- 1.1 Drop and recreate view_staff_submission_windows to exclude paused users
DROP VIEW IF EXISTS view_staff_submission_windows;

CREATE VIEW view_staff_submission_windows AS
WITH base_staff AS (
  SELECT s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.participation_start_at,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
    AND s.is_paused = false  -- NEW: Exclude paused users
), assignment_weeks AS (
  SELECT DISTINCT weekly_assignments.week_start_date
  FROM weekly_assignments
  WHERE weekly_assignments.status = 'locked'::text AND weekly_assignments.superseded_at IS NULL
), staff_weeks AS (
  SELECT bs.staff_id,
    bs.staff_name,
    bs.role_id,
    bs.location_id,
    bs.program_start_date,
    bs.cycle_length_weeks,
    bs.timezone,
    aw.week_start_date AS week_of
  FROM base_staff bs
  CROSS JOIN assignment_weeks aw
  WHERE COALESCE(bs.participation_start_at::date, bs.hire_date) <= (aw.week_start_date + '6 days'::interval)::date
), week_context AS (
  SELECT sw.staff_id,
    sw.staff_name,
    sw.role_id,
    sw.location_id,
    sw.program_start_date,
    sw.cycle_length_weeks,
    sw.timezone,
    sw.week_of,
    GREATEST(0, (sw.week_of - date_trunc('week'::text, (sw.program_start_date AT TIME ZONE sw.timezone))::date) / 7) AS week_index
  FROM staff_weeks sw
), cycle_calc AS (
  SELECT wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.program_start_date,
    wc.cycle_length_weeks,
    wc.timezone,
    wc.week_of,
    wc.week_index,
    CASE
      WHEN wc.week_index = 0 THEN 1
      ELSE wc.week_index / wc.cycle_length_weeks + 1
    END AS cycle_number,
    CASE
      WHEN wc.week_index = 0 THEN 1
      ELSE wc.week_index % wc.cycle_length_weeks + 1
    END AS week_in_cycle
  FROM week_context wc
), assignments_data AS (
  SELECT cc.staff_id,
    cc.staff_name,
    cc.role_id,
    cc.location_id,
    cc.week_of,
    cc.cycle_number,
    cc.week_in_cycle,
    cc.timezone,
    wa.id AS assignment_id,
    wa.action_id,
    wa.self_select AS is_self_select,
    wa.display_order AS slot_index,
    NOT wa.self_select AS required
  FROM cycle_calc cc
  JOIN weekly_assignments wa ON wa.role_id = cc.role_id AND wa.week_start_date = cc.week_of AND wa.status = 'locked'::text AND wa.superseded_at IS NULL AND (wa.location_id = cc.location_id OR wa.org_id IS NOT NULL AND wa.location_id IS NULL AND (EXISTS ( SELECT 1
    FROM locations l2
    WHERE l2.id = cc.location_id AND l2.organization_id = wa.org_id)) OR wa.org_id IS NULL AND wa.location_id IS NULL)
), conf_data AS (
  SELECT ad.staff_id,
    ad.staff_name,
    ad.role_id,
    ad.location_id,
    ad.week_of,
    ad.cycle_number,
    ad.week_in_cycle,
    ad.action_id,
    ad.is_self_select,
    ad.slot_index,
    ad.required,
    ws.confidence_score,
    ws.confidence_date AS submitted_at,
    ws.confidence_late AS submitted_late,
    ((ad.week_of + '1 day'::interval + '12:00:00'::interval) AT TIME ZONE ad.timezone) AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws ON ws.staff_id = ad.staff_id AND ws.assignment_id = ('assign:'::text || ad.assignment_id)
), perf_data AS (
  SELECT ad.staff_id,
    ad.staff_name,
    ad.role_id,
    ad.location_id,
    ad.week_of,
    ad.cycle_number,
    ad.week_in_cycle,
    ad.action_id,
    ad.is_self_select,
    ad.slot_index,
    ad.required,
    ws.performance_score,
    ws.performance_date AS submitted_at,
    ws.performance_late AS submitted_late,
    ((ad.week_of + '6 days'::interval + '12:00:00'::interval) AT TIME ZONE ad.timezone) AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws ON ws.staff_id = ad.staff_id AND ws.assignment_id = ('assign:'::text || ad.assignment_id)
)
SELECT
  cd.staff_id,
  cd.staff_name,
  cd.role_id,
  cd.location_id,
  cd.week_of,
  cd.cycle_number,
  cd.week_in_cycle,
  cd.action_id,
  cd.is_self_select,
  cd.slot_index,
  cd.required,
  'confidence'::text AS metric,
  CASE
    WHEN cd.confidence_score IS NOT NULL THEN 'submitted'::text
    WHEN now() AT TIME ZONE 'America/Chicago' > cd.due_at THEN 'missing'::text
    ELSE 'pending'::text
  END AS status,
  cd.submitted_at,
  cd.submitted_late,
  cd.due_at
FROM conf_data cd
WHERE cd.required = true

UNION ALL

SELECT
  pd.staff_id,
  pd.staff_name,
  pd.role_id,
  pd.location_id,
  pd.week_of,
  pd.cycle_number,
  pd.week_in_cycle,
  pd.action_id,
  pd.is_self_select,
  pd.slot_index,
  pd.required,
  'performance'::text AS metric,
  CASE
    WHEN pd.performance_score IS NOT NULL THEN 'submitted'::text
    WHEN now() AT TIME ZONE 'America/Chicago' > pd.due_at THEN 'missing'::text
    ELSE 'pending'::text
  END AS status,
  pd.submitted_at,
  pd.submitted_late,
  pd.due_at
FROM perf_data pd
WHERE pd.required = true;

-- 1.2 Update get_staff_weekly_scores to exclude paused users
CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(p_coach_user_id uuid, p_week_of text DEFAULT NULL::text)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, organization_id uuid, organization_name text, score_id uuid, week_of date, assignment_id text, action_id bigint, selected_action_id bigint, confidence_score integer, confidence_date timestamp with time zone, confidence_late boolean, confidence_source score_source, performance_score integer, performance_date timestamp with time zone, performance_late boolean, performance_source score_source, action_statement text, domain_id bigint, domain_name text, display_order integer, self_select boolean)
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
  -- Get coach info from staff table
  SELECT s.id, s.coach_scope_type, s.coach_scope_id, s.is_super_admin, s.is_org_admin
  INTO v_coach_staff_id, v_coach_scope_type, v_coach_scope_id, v_is_super_admin, v_is_org_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_super_admin OR s.is_org_admin OR s.is_office_manager)
  LIMIT 1;

  -- If not a coach/admin/OM, return empty
  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  -- Get the target week
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
      o.id AS organization_id,
      o.name AS organization_name
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    INNER JOIN organizations o ON o.id = l.organization_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    WHERE s.is_participant = true
      AND s.is_org_admin = false
      AND s.is_paused = false  -- NEW: Exclude paused users
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
    fs.organization_id,
    fs.organization_name,
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

-- 1.3 Update get_location_domain_staff_averages to exclude paused users
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
    WHERE l.organization_id = p_org_id
      AND s.is_participant = true
      AND s.is_paused = false  -- NEW: Exclude paused users
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

-- Fix ambiguous column references in get_staff_all_weekly_scores

CREATE OR REPLACE FUNCTION public.get_staff_all_weekly_scores(p_staff_id uuid)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  week_of date,
  action_id bigint,
  action_statement text,
  domain_id bigint,
  domain_name text,
  confidence_score integer,
  performance_score integer,
  confidence_date timestamp with time zone,
  performance_date timestamp with time zone,
  confidence_late boolean,
  performance_late boolean,
  is_self_select boolean,
  display_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_staff_role_id bigint;
BEGIN
  -- Get staff role_id first to avoid ambiguous references
  SELECT s.role_id INTO v_staff_role_id
  FROM staff s
  WHERE s.id = p_staff_id;

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
      l.organization_id AS org_id,
      o.name AS org_name,
      l.program_start_date,
      l.cycle_length_weeks,
      l.timezone
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.role_id
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    WHERE s.id = p_staff_id
  ),
  -- Calculate which weeks are onboarding (cycles 1-3) vs graduated (4+)
  week_cycles AS (
    SELECT 
      si.*,
      wf.week_start_date as week_of,
      wf.cycle as cycle_number,
      CASE 
        WHEN wf.cycle < 4 THEN true 
        ELSE false 
      END as is_onboarding_week
    FROM staff_info si
    CROSS JOIN (
      SELECT DISTINCT wf2.week_start_date, wf2.cycle 
      FROM weekly_focus wf2
      WHERE wf2.role_id = v_staff_role_id
    ) wf
    WHERE wf.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wf.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
    
    UNION
    
    SELECT 
      si.*,
      wa.week_start_date as week_of,
      -- Calculate cycle for assignments based on location calendar
      GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (wa.week_start_date - si.program_start_date)) / (7 * 24 * 60 * 60 * si.cycle_length_weeks))::integer + 1) as cycle_number,
      CASE 
        WHEN GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (wa.week_start_date - si.program_start_date)) / (7 * 24 * 60 * 60 * si.cycle_length_weeks))::integer + 1) < 4 THEN true
        ELSE false
      END as is_onboarding_week
    FROM staff_info si
    CROSS JOIN (
      SELECT DISTINCT wa2.week_start_date 
      FROM weekly_assignments wa2
      WHERE wa2.role_id = v_staff_role_id
        AND wa2.status IN ('active', 'locked')
    ) wa
    WHERE wa.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wa.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
  ),
  -- Use weekly_focus for onboarding weeks (cycles 1-3)
  focus_scores AS (
    SELECT 
      wc.id AS staff_id,
      wc.name AS staff_name,
      wc.email AS staff_email,
      wc.user_id,
      wc.role_id,
      wc.role_name,
      wc.primary_location_id AS location_id,
      wc.loc_name AS location_name,
      wc.org_id AS organization_id,
      wc.org_name AS organization_name,
      wf.week_start_date AS week_of,
      wf.action_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      wf.self_select AS is_self_select,
      wf.display_order
    FROM week_cycles wc
    INNER JOIN weekly_focus wf ON 
      wf.role_id = wc.role_id
      AND wf.week_start_date = wc.week_of
      AND wc.is_onboarding_week = true
    LEFT JOIN pro_moves pm ON wf.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = wc.id
      AND ws.week_of = wf.week_start_date
      AND ws.weekly_focus_id = wf.id::text
  ),
  -- Use weekly_assignments for graduated weeks (cycle 4+)
  assignment_scores AS (
    SELECT 
      wc.id AS staff_id,
      wc.name AS staff_name,
      wc.email AS staff_email,
      wc.user_id,
      wc.role_id,
      wc.role_name,
      wc.primary_location_id AS location_id,
      wc.loc_name AS location_name,
      wc.org_id AS organization_id,
      wc.org_name AS organization_name,
      wa.week_start_date AS week_of,
      wa.action_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      wa.self_select AS is_self_select,
      wa.display_order
    FROM week_cycles wc
    INNER JOIN weekly_assignments wa ON 
      wa.role_id = wc.role_id
      AND wa.week_start_date = wc.week_of
      AND wa.status IN ('active', 'locked')
      AND (wa.location_id = wc.primary_location_id OR wa.location_id IS NULL)
      AND wc.is_onboarding_week = false
    LEFT JOIN pro_moves pm ON wa.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = wc.id
      AND ws.week_of = wa.week_start_date
      AND ws.assignment_id = ('assign:' || wa.id::text)
  )
  SELECT * FROM focus_scores
  UNION ALL
  SELECT * FROM assignment_scores
  ORDER BY week_of DESC, display_order;
END;
$function$;
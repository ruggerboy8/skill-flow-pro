-- Simplified fix for get_staff_all_weekly_scores
-- Use weekly_focus cycles for onboarding, assume weekly_assignments are for cycle 4+

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
      o.name AS org_name
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.role_id
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    WHERE s.id = p_staff_id
  ),
  -- Use weekly_focus for cycles 1-3 (onboarding)
  focus_scores AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
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
    FROM staff_info si
    INNER JOIN weekly_focus wf ON 
      wf.role_id = si.role_id
      AND wf.cycle < 4  -- Only onboarding cycles
      AND wf.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wf.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
    LEFT JOIN pro_moves pm ON wf.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = si.id
      AND ws.week_of = wf.week_start_date
      AND ws.weekly_focus_id = wf.id::text
  ),
  -- Use weekly_assignments for cycle 4+ (graduated)
  -- Only include weeks where NO weekly_focus exists (to avoid showing both)
  assignment_scores AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
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
    FROM staff_info si
    INNER JOIN weekly_assignments wa ON 
      wa.role_id = si.role_id
      AND wa.status IN ('active', 'locked')
      AND (wa.location_id = si.primary_location_id OR wa.location_id IS NULL)
      AND wa.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wa.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
      -- Only use weekly_assignments when NO onboarding weekly_focus exists
      AND NOT EXISTS (
        SELECT 1
        FROM weekly_focus wf2
        WHERE wf2.role_id = wa.role_id
          AND wf2.cycle < 4
          AND wf2.week_start_date = wa.week_start_date
      )
    LEFT JOIN pro_moves pm ON wa.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = si.id
      AND ws.week_of = wa.week_start_date
      AND ws.assignment_id = ('assign:' || wa.id::text)
  )
  SELECT * FROM focus_scores
  UNION ALL
  SELECT * FROM assignment_scores
  ORDER BY week_of DESC, display_order;
END;
$function$;
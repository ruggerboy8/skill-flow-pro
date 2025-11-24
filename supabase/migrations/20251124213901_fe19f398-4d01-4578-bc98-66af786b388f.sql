-- Update get_staff_weekly_scores RPC to use new deadline times
CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of text DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  staff_email text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  score_id uuid,
  week_of text,
  assignment_id text,
  action_id bigint,
  selected_action_id bigint,
  confidence_score integer,
  confidence_date timestamptz,
  confidence_late boolean,
  confidence_source text,
  performance_score integer,
  performance_date timestamptz,
  performance_late boolean,
  performance_source text,
  action_statement text,
  domain_id bigint,
  domain_name text,
  display_order integer,
  self_select boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start date;
BEGIN
  -- Normalize to Monday if week provided, otherwise use current week
  IF p_week_of IS NOT NULL THEN
    v_week_start := date_trunc('week', p_week_of::date)::date;
  ELSE
    v_week_start := date_trunc('week', (NOW() AT TIME ZONE 'America/Chicago')::date)::date;
  END IF;

  RETURN QUERY
  WITH coach_scope AS (
    SELECT 
      s.coach_scope_type,
      s.coach_scope_id
    FROM staff s
    WHERE s.user_id = p_coach_user_id
      AND (s.is_coach OR s.is_lead OR s.is_super_admin)
    LIMIT 1
  ),
  visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    CROSS JOIN coach_scope cs
    LEFT JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        (cs.coach_scope_type = 'organization' AND l.organization_id = cs.coach_scope_id::uuid)
        OR (cs.coach_scope_type = 'location' AND s.primary_location_id = cs.coach_scope_id::uuid)
        OR (cs.coach_scope_type IS NULL)
      )
  ),
  staff_data AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.email AS staff_email,
      s.role_id::bigint,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.organization_id,
      o.name AS organization_name
    FROM visible_staff vs
    INNER JOIN staff s ON s.id = vs.staff_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
  ),
  assignments_for_week AS (
    SELECT
      wa.id AS assignment_id,
      wa.role_id,
      wa.action_id,
      wa.week_start_date,
      wa.display_order,
      wa.self_select,
      wa.org_id,
      wa.location_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name
    FROM weekly_assignments wa
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = pm.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE wa.week_start_date = v_week_start
      AND wa.status = 'locked'
  )
  SELECT
    sd.staff_id,
    sd.staff_name,
    sd.staff_email,
    sd.role_id,
    sd.role_name,
    sd.location_id,
    sd.location_name,
    sd.organization_id,
    sd.organization_name,
    ws.id AS score_id,
    TO_CHAR(afw.week_start_date, 'YYYY-MM-DD') AS week_of,
    ('assign:' || afw.assignment_id) AS assignment_id,
    afw.action_id,
    COALESCE(wss.selected_action_id, afw.action_id) AS selected_action_id,
    ws.confidence_score,
    ws.confidence_date,
    -- Dynamic calculation: Tuesday 3:00 PM deadline
    CASE 
      WHEN ws.confidence_date IS NOT NULL THEN 
        ws.confidence_date > (afw.week_start_date + INTERVAL '1 day 15 hours')
      ELSE NULL
    END AS confidence_late,
    ws.confidence_source::text,
    ws.performance_score,
    ws.performance_date,
    -- Dynamic calculation: Friday 5:00 PM deadline
    CASE 
      WHEN ws.performance_date IS NOT NULL THEN 
        ws.performance_date > (afw.week_start_date + INTERVAL '4 days 17 hours')
      ELSE NULL
    END AS performance_late,
    ws.performance_source::text,
    COALESCE(
      pm_selected.action_statement,
      afw.action_statement,
      'Self-Select'
    ) AS action_statement,
    COALESCE(
      c_selected.domain_id,
      afw.domain_id
    ) AS domain_id,
    COALESCE(
      d_selected.domain_name,
      afw.domain_name,
      'General'
    ) AS domain_name,
    afw.display_order,
    afw.self_select
  FROM staff_data sd
  INNER JOIN assignments_for_week afw ON 
    afw.role_id = sd.role_id
    AND (afw.org_id IS NULL OR afw.org_id = sd.organization_id)
    AND (afw.location_id IS NULL OR afw.location_id = sd.location_id)
  LEFT JOIN weekly_scores ws ON 
    ws.staff_id = sd.staff_id
    AND ws.assignment_id = ('assign:' || afw.assignment_id)
  LEFT JOIN weekly_self_select wss ON 
    wss.assignment_id = ('assign:' || afw.assignment_id)
    AND wss.user_id = (SELECT user_id FROM staff WHERE id = sd.staff_id)
  LEFT JOIN pro_moves pm_selected ON pm_selected.action_id = wss.selected_action_id
  LEFT JOIN competencies c_selected ON c_selected.competency_id = pm_selected.competency_id
  LEFT JOIN domains d_selected ON d_selected.domain_id = c_selected.domain_id
  ORDER BY sd.staff_name, afw.display_order;
END;
$$;
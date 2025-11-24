-- Drop and recreate get_staff_weekly_scores with dynamic late flag calculation
DROP FUNCTION IF EXISTS public.get_staff_weekly_scores(uuid, date);

CREATE FUNCTION public.get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of date DEFAULT NULL
)
RETURNS TABLE(
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
  week_of date,
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
SET search_path = public
AS $$
DECLARE
  v_target_week date;
BEGIN
  -- Determine target week
  IF p_week_of IS NOT NULL THEN
    v_target_week := date_trunc('week', p_week_of::timestamp)::date;
  ELSE
    SELECT MAX(wa.week_start_date) INTO v_target_week
    FROM weekly_assignments wa
    WHERE wa.status = 'locked';
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
  )
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.email AS staff_email,
    s.role_id::bigint,
    r.role_name,
    s.primary_location_id AS location_id,
    l.name AS location_name,
    l.organization_id,
    o.name AS organization_name,
    ws.id AS score_id,
    wa.week_start_date AS week_of,
    ('assign:' || wa.id) AS assignment_id,
    wa.action_id::bigint,
    ws.selected_action_id::bigint,
    ws.confidence_score,
    ws.confidence_date,
    -- Calculate confidence_late dynamically: due Tuesday 11:59:59 PM
    CASE 
      WHEN ws.confidence_date IS NULL THEN NULL
      ELSE ws.confidence_date > (wa.week_start_date + INTERVAL '1 day 23 hours 59 minutes 59 seconds')
    END AS confidence_late,
    ws.confidence_source::text,
    ws.performance_score,
    ws.performance_date,
    -- Calculate performance_late dynamically: due Friday 11:59:59 PM
    CASE 
      WHEN ws.performance_date IS NULL THEN NULL
      ELSE ws.performance_date > (wa.week_start_date + INTERVAL '4 days 23 hours 59 minutes 59 seconds')
    END AS performance_late,
    ws.performance_source::text,
    COALESCE(pm.action_statement, 'Self-Select') AS action_statement,
    c.domain_id::bigint,
    d.domain_name,
    wa.display_order,
    wa.self_select
  FROM visible_staff vs
  INNER JOIN staff s ON s.id = vs.staff_id
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN organizations o ON o.id = l.organization_id
  LEFT JOIN weekly_assignments wa ON 
    wa.role_id = s.role_id
    AND wa.week_start_date = v_target_week
    AND wa.status = 'locked'
    AND (wa.org_id IS NULL OR wa.org_id = l.organization_id)
    AND (wa.location_id IS NULL OR wa.location_id = s.primary_location_id)
  LEFT JOIN weekly_scores ws ON
    ws.staff_id = s.id
    AND ws.assignment_id = ('assign:' || wa.id)
  LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
  LEFT JOIN competencies c ON c.competency_id = COALESCE(wa.competency_id, pm.competency_id)
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  WHERE wa.id IS NOT NULL
  ORDER BY s.name, wa.display_order;
END;
$$;
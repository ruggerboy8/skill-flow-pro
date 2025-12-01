-- Fix organization_id ambiguity in get_staff_weekly_scores

DROP FUNCTION IF EXISTS get_staff_weekly_scores(uuid, text);

CREATE FUNCTION get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of text DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id int,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  week_of date,
  action_id int,
  action_statement text,
  domain_name text,
  assignment_id text,
  weekly_focus_id uuid,
  self_select boolean,
  confidence_score int,
  confidence_date timestamptz,
  confidence_late boolean,
  performance_score int,
  performance_date timestamptz,
  performance_late boolean
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_week_start date;
BEGIN
  IF p_week_of IS NOT NULL AND p_week_of != 'current' THEN
    v_target_week_start := p_week_of::date;
  ELSE
    v_target_week_start := date_trunc('week', CURRENT_DATE)::date;
  END IF;

  RETURN QUERY
  WITH coach_scope AS (
    SELECT 
      s.id AS staff_id,
      s.coach_scope_type,
      s.coach_scope_id,
      l.organization_id AS coach_org_id
    FROM staff s
    LEFT JOIN locations l ON l.id = s.primary_location_id
    WHERE s.user_id = p_coach_user_id
  ),
  staff_in_scope AS (
    SELECT DISTINCT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.organization_id AS organization_id,
      o.name AS organization_name
    FROM staff s
    INNER JOIN coach_scope cs ON (
      (cs.coach_scope_type = 'organization' AND s.primary_location_id IN (
        SELECT id FROM locations WHERE organization_id = cs.coach_scope_id
      )) OR
      (cs.coach_scope_type = 'location' AND s.primary_location_id = cs.coach_scope_id)
    )
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
  ),
  applicable_assignments AS (
    SELECT
      sd.staff_id,
      sd.role_id,
      sd.location_id,
      sd.organization_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.id AS assignment_id,
      NULL::uuid AS weekly_focus_id
    FROM staff_in_scope sd
    INNER JOIN weekly_assignments wa ON wa.role_id = sd.role_id
    WHERE wa.week_start_date = v_target_week_start
      AND wa.status = 'locked'
      AND (wa.location_id = sd.location_id OR wa.location_id IS NULL)
      AND (wa.org_id = sd.organization_id OR wa.org_id IS NULL)
      AND NOT (
        wa.source = 'global'
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = sd.location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
    UNION ALL
    SELECT
      sd.staff_id,
      sd.role_id,
      sd.location_id,
      sd.organization_id,
      wf.week_start_date,
      wf.action_id,
      wf.competency_id,
      wf.self_select,
      NULL AS assignment_id,
      wf.id AS weekly_focus_id
    FROM staff_in_scope sd
    INNER JOIN weekly_focus wf ON wf.role_id = sd.role_id
    WHERE wf.week_start_date = v_target_week_start
  ),
  scores_data AS (
    SELECT
      aa.staff_id,
      aa.week_start_date,
      aa.action_id,
      aa.competency_id,
      aa.self_select,
      aa.assignment_id,
      aa.weekly_focus_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM applicable_assignments aa
    LEFT JOIN weekly_scores ws ON (
      ws.staff_id = aa.staff_id
      AND ws.week_of = aa.week_start_date
      AND (
        (aa.assignment_id IS NOT NULL AND ws.assignment_id = ('assign:' || aa.assignment_id))
        OR (aa.weekly_focus_id IS NOT NULL AND ws.weekly_focus_id = aa.weekly_focus_id)
        OR (ws.site_action_id = aa.action_id AND ws.assignment_id IS NULL AND ws.weekly_focus_id IS NULL)
      )
    )
  )
  SELECT
    sd.staff_id::uuid,
    sd.staff_name,
    sd.role_id::int,
    sd.role_name,
    sd.location_id::uuid,
    sd.location_name,
    sd.organization_id::uuid,
    sd.organization_name,
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
  FROM scores_data s
  INNER JOIN staff_in_scope sd ON sd.staff_id = s.staff_id
  LEFT JOIN competencies c ON c.competency_id = s.competency_id
  LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(s.action_id, c.action_id)
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY sd.staff_name, s.week_start_date;
END;
$$;
-- Fix column ambiguities in get_staff_all_weekly_scores

DROP FUNCTION IF EXISTS get_staff_all_weekly_scores(uuid);

CREATE FUNCTION get_staff_all_weekly_scores(p_staff_id uuid)
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
BEGIN
  RETURN QUERY
  WITH staff_info AS (
    SELECT 
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.organization_id,
      o.name AS organization_name,
      s.hire_date,
      s.participation_start_at
    FROM staff s
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.id = p_staff_id
  ),
  assignment_scores AS (
    SELECT
      si.staff_id,
      si.role_id,
      si.location_id,
      si.organization_id,
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
      ws.staff_id = si.staff_id::text
      AND ws.week_of = wa.week_start_date
      AND ws.assignment_id = ('assign:' || wa.id)
    )
    WHERE wa.status = 'locked'
      AND (wa.location_id = si.location_id OR wa.location_id IS NULL)
      AND (wa.org_id = si.organization_id OR wa.org_id IS NULL)
      AND wa.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wa.week_start_date <= CURRENT_DATE
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
      si.organization_id,
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
      ws.staff_id = si.staff_id::text
      AND ws.week_of = wf.week_start_date
      AND ws.weekly_focus_id = wf.id
    )
    WHERE wf.week_start_date >= COALESCE(si.participation_start_at::date, si.hire_date)
      AND wf.week_start_date <= CURRENT_DATE
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
    si.organization_id::uuid,
    si.organization_name,
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
$$;
-- Add optional week_of parameter to get_staff_weekly_scores RPC

CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(
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
  confidence_source score_source,
  performance_score integer,
  performance_date timestamptz,
  performance_late boolean,
  performance_source score_source,
  action_statement text,
  domain_id bigint,
  domain_name text,
  display_order integer,
  self_select boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
  v_target_week date;
BEGIN
  -- Get coach scope and super admin status
  SELECT s.coach_scope_type, s.coach_scope_id, s.is_super_admin
  INTO v_coach_scope_type, v_coach_scope_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_super_admin)
  LIMIT 1;

  -- If not a coach/admin, return empty
  IF v_is_super_admin IS NULL THEN
    RETURN;
  END IF;

  -- Use provided week or get the most recent week_of date, converted to Monday
  IF p_week_of IS NOT NULL THEN
    v_target_week := p_week_of;
  ELSE
    SELECT MAX((ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date)
    INTO v_target_week
    FROM weekly_scores ws;
  END IF;

  RETURN QUERY
  WITH filtered_staff AS (
    SELECT
      s.id,
      s.name,
      s.email,
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
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR (v_coach_scope_type = 'organization' AND l.organization_id = v_coach_scope_id)
        OR (v_coach_scope_type = 'location' AND s.primary_location_id = v_coach_scope_id)
      )
  )
  SELECT
    fs.id AS staff_id,
    fs.name AS staff_name,
    fs.email AS staff_email,
    fs.role_id::bigint,
    fs.role_name,
    fs.location_id,
    fs.location_name,
    fs.organization_id,
    fs.organization_name,
    ws.id AS score_id,
    (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date AS week_of,
    ws.assignment_id,
    wa.action_id,
    ws.selected_action_id,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.confidence_source,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late,
    ws.performance_source,
    COALESCE(pm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
    COALESCE(c.domain_id, c_sel.domain_id) AS domain_id,
    COALESCE(d.domain_name, d_sel.domain_name) AS domain_name,
    wa.display_order,
    wa.self_select
  FROM filtered_staff fs
  LEFT JOIN weekly_scores ws ON ws.staff_id = fs.id
    AND (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date = v_target_week
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
$$;
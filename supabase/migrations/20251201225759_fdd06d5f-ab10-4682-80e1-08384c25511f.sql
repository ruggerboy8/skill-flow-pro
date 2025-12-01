-- Fix get_staff_weekly_scores to handle super admins
DROP FUNCTION IF EXISTS get_staff_weekly_scores(uuid, text);

CREATE OR REPLACE FUNCTION get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of text DEFAULT NULL
)
RETURNS TABLE (
  staff_id text,
  staff_name text,
  staff_email text,
  user_id text,
  role_id int,
  role_name text,
  location_id text,
  location_name text,
  organization_id text,
  organization_name text,
  score_id text,
  week_of text,
  assignment_id text,
  action_id int,
  selected_action_id int,
  confidence_score int,
  confidence_date text,
  confidence_late boolean,
  confidence_source text,
  performance_score int,
  performance_date text,
  performance_late boolean,
  performance_source text,
  action_statement text,
  domain_id int,
  domain_name text,
  display_order int,
  self_select boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_is_super_admin boolean;
  v_coach_scope_type text;
  v_coach_scope_id text;
  v_org_id text;
  v_target_week text;
BEGIN
  -- Check if user is super admin
  SELECT s.is_super_admin, s.coach_scope_type, s.coach_scope_id
  INTO v_is_super_admin, v_coach_scope_type, v_coach_scope_id
  FROM staff s
  WHERE s.user_id = p_coach_user_id
  LIMIT 1;

  -- If not super admin, require coach scope
  IF NOT COALESCE(v_is_super_admin, false) THEN
    IF v_coach_scope_type IS NULL THEN
      RAISE EXCEPTION 'No coach scope found for user %', p_coach_user_id;
    END IF;

    -- Determine organization_id for scoped coaches
    IF v_coach_scope_type = 'organization' THEN
      v_org_id := v_coach_scope_id;
    ELSIF v_coach_scope_type = 'location' THEN
      SELECT organization_id INTO v_org_id
      FROM locations
      WHERE id = v_coach_scope_id;
    ELSE
      RAISE EXCEPTION 'Unsupported coach scope type: %', v_coach_scope_type;
    END IF;
  END IF;

  -- Determine target week
  v_target_week := COALESCE(p_week_of, to_char(CURRENT_DATE, 'YYYY-MM-DD'));

  -- Return data
  RETURN QUERY
  WITH staff_in_scope AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      r.role_name,
      s.primary_location_id,
      l.name AS location_name,
      l.organization_id,
      o.name AS organization_name
    FROM staff s
    JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND (
        -- Super admins see all staff
        v_is_super_admin = true
        OR
        -- Scoped coaches see their scope
        (v_coach_scope_type = 'organization' AND l.organization_id = v_org_id)
        OR
        (v_coach_scope_type = 'location' AND s.primary_location_id = v_coach_scope_id)
      )
  ),
  
  all_assignments AS (
    -- New system: weekly_assignments
    SELECT
      wa.week_start_date,
      wa.role_id,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order,
      'assign:' || wa.id AS assignment_id,
      wa.location_id,
      wa.org_id
    FROM weekly_assignments wa
    WHERE wa.status = 'active' AND wa.superseded_at IS NULL
      AND wa.week_start_date = v_target_week

    UNION ALL

    -- Legacy system: weekly_focus
    SELECT
      wf.week_start_date,
      wf.role_id,
      wf.action_id,
      wf.competency_id,
      wf.self_select,
      wf.display_order,
      'focus:' || wf.id AS assignment_id,
      NULL::text AS location_id,
      NULL::text AS org_id
    FROM weekly_focus wf
    WHERE wf.week_start_date = v_target_week
  ),

  filtered_assignments AS (
    SELECT a.*
    FROM all_assignments a
    WHERE NOT EXISTS (
      SELECT 1
      FROM locations loc
      WHERE loc.onboarding_active = true
        AND (v_is_super_admin = false AND loc.organization_id = v_org_id)
        AND a.location_id IS NULL
        AND a.org_id IS NULL
    )
  ),

  staff_assignments AS (
    SELECT
      sis.id AS staff_id,
      sis.name AS staff_name,
      sis.email AS staff_email,
      sis.user_id::text AS user_id,
      sis.role_id,
      sis.role_name,
      sis.primary_location_id AS location_id,
      sis.location_name,
      sis.organization_id,
      sis.organization_name,
      a.week_start_date,
      a.action_id,
      a.competency_id,
      a.self_select,
      a.display_order,
      a.assignment_id
    FROM staff_in_scope sis
    CROSS JOIN filtered_assignments a
    WHERE a.role_id = sis.role_id
  ),

  scores AS (
    SELECT
      ws.id AS score_id,
      ws.staff_id,
      ws.week_of,
      ws.assignment_id,
      CASE
        WHEN ws.assignment_id LIKE 'assign:%' THEN
          (SELECT wa.action_id FROM weekly_assignments wa WHERE 'assign:' || wa.id = ws.assignment_id LIMIT 1)
        WHEN ws.assignment_id LIKE 'focus:%' THEN
          (SELECT wf.action_id FROM weekly_focus wf WHERE 'focus:' || wf.id = ws.assignment_id LIMIT 1)
        ELSE NULL
      END AS action_id,
      ws.selected_action_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text
    FROM weekly_scores ws
    WHERE ws.week_of = v_target_week
  ),

  enriched_scores AS (
    SELECT
      sa.staff_id,
      sa.staff_name,
      sa.staff_email,
      sa.user_id,
      sa.role_id,
      sa.role_name,
      sa.location_id,
      sa.location_name,
      sa.organization_id,
      sa.organization_name,
      COALESCE(scores.score_id, '')::text AS score_id,
      sa.week_start_date AS week_of,
      sa.assignment_id,
      COALESCE(scores.action_id, scores.selected_action_id)::int AS action_id,
      COALESCE(scores.selected_action_id, 0)::int AS selected_action_id,
      scores.confidence_score,
      scores.confidence_date,
      scores.confidence_late,
      COALESCE(scores.confidence_source, 'live') AS confidence_source,
      scores.performance_score,
      scores.performance_date,
      scores.performance_late,
      COALESCE(scores.performance_source, 'live') AS performance_source,
      sa.competency_id,
      sa.self_select,
      sa.display_order
    FROM staff_assignments sa
    LEFT JOIN scores ON scores.staff_id = sa.staff_id
      AND scores.week_of = sa.week_start_date
      AND scores.assignment_id = sa.assignment_id
  )

  SELECT
    es.staff_id::text,
    es.staff_name,
    es.staff_email,
    es.user_id,
    es.role_id,
    es.role_name,
    es.location_id::text,
    es.location_name,
    es.organization_id::text,
    es.organization_name,
    es.score_id,
    es.week_of,
    es.assignment_id,
    es.action_id,
    es.selected_action_id,
    es.confidence_score,
    es.confidence_date,
    es.confidence_late,
    es.confidence_source,
    es.performance_score,
    es.performance_date,
    es.performance_late,
    es.performance_source,
    COALESCE(pm.action_statement, '') AS action_statement,
    d.domain_id,
    d.domain_name,
    es.display_order,
    es.self_select
  FROM enriched_scores es
  LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(es.action_id, es.selected_action_id)
  LEFT JOIN competencies c ON c.competency_id = es.competency_id
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  ORDER BY es.staff_name, es.display_order;
END;
$$;
-- Drop and recreate get_staff_submission_windows to exclude exempt weeks
DROP FUNCTION IF EXISTS get_staff_submission_windows(UUID, DATE);

CREATE FUNCTION get_staff_submission_windows(
  p_staff_id UUID,
  p_since DATE DEFAULT NULL
)
RETURNS TABLE(
  staff_id UUID,
  staff_name TEXT,
  week_of DATE,
  cycle_number INTEGER,
  week_in_cycle INTEGER,
  slot_index INTEGER,
  action_id BIGINT,
  is_self_select BOOLEAN,
  metric TEXT,
  status TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_late BOOLEAN,
  due_at TIMESTAMPTZ,
  on_time BOOLEAN,
  required BOOLEAN,
  location_id UUID,
  role_id BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.staff_id,
    v.staff_name,
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.slot_index,
    v.action_id,
    v.is_self_select,
    v.metric,
    v.status,
    v.submitted_at,
    v.submitted_late,
    v.due_at,
    v.on_time,
    v.required,
    v.location_id,
    v.role_id
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.week_of >= p_since)
    AND v.week_of NOT IN (SELECT week_start_date FROM excused_weeks)
  ORDER BY v.week_of DESC, v.slot_index, v.metric;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Create get_staff_all_weekly_scores RPC for staff detail page
CREATE FUNCTION get_staff_all_weekly_scores(p_staff_id UUID)
RETURNS TABLE(
  staff_id UUID,
  staff_name TEXT,
  staff_email TEXT,
  user_id UUID,
  role_id BIGINT,
  role_name TEXT,
  location_id UUID,
  location_name TEXT,
  organization_id UUID,
  organization_name TEXT,
  score_id UUID,
  week_of DATE,
  assignment_id UUID,
  action_id BIGINT,
  selected_action_id BIGINT,
  confidence_score INTEGER,
  confidence_date TIMESTAMPTZ,
  confidence_late BOOLEAN,
  confidence_source TEXT,
  performance_score INTEGER,
  performance_date TIMESTAMPTZ,
  performance_late BOOLEAN,
  performance_source TEXT,
  action_statement TEXT,
  domain_id BIGINT,
  domain_name TEXT,
  display_order INTEGER,
  self_select BOOLEAN,
  is_week_exempt BOOLEAN
) AS $$
DECLARE
  v_staff_record RECORD;
BEGIN
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.email AS staff_email,
    s.user_id,
    s.role_id::BIGINT,
    r.role_name,
    s.primary_location_id AS location_id,
    l.name AS location_name,
    l.organization_id,
    o.name AS organization_name
  INTO v_staff_record
  FROM staff s
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN organizations o ON o.id = l.organization_id
  WHERE s.id = p_staff_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH applicable_assignments AS (
    SELECT
      wa.id AS assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order,
      EXISTS(SELECT 1 FROM excused_weeks WHERE week_start_date = wa.week_start_date) AS is_exempt
    FROM weekly_assignments wa
    WHERE wa.role_id = v_staff_record.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = v_staff_record.location_id
        OR (wa.location_id IS NULL AND wa.org_id = v_staff_record.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
  ),
  scores_data AS (
    SELECT
      aa.assignment_id,
      aa.week_start_date,
      aa.action_id,
      aa.competency_id,
      aa.self_select,
      aa.display_order,
      aa.is_exempt,
      ws.id AS score_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_source::TEXT,
      ws.performance_score,
      ws.performance_date,
      ws.performance_source::TEXT,
      ws.selected_action_id,
      CASE
        WHEN ws.confidence_date IS NOT NULL
        THEN ws.confidence_date > (aa.week_start_date + INTERVAL '1 day 15 hours')
        ELSE NULL
      END AS confidence_late,
      CASE
        WHEN ws.performance_date IS NOT NULL
        THEN ws.performance_date > (aa.week_start_date + INTERVAL '4 days 17 hours')
        ELSE NULL
      END AS performance_late
    FROM applicable_assignments aa
    LEFT JOIN weekly_scores ws
      ON ws.staff_id = p_staff_id
      AND ws.assignment_id = ('assign:' || aa.assignment_id)
  ),
  enriched_scores AS (
    SELECT
      v_staff_record.staff_id,
      v_staff_record.staff_name,
      v_staff_record.staff_email,
      v_staff_record.user_id,
      v_staff_record.role_id,
      v_staff_record.role_name,
      v_staff_record.location_id,
      v_staff_record.location_name,
      v_staff_record.organization_id,
      v_staff_record.organization_name,
      scores.score_id,
      scores.week_start_date,
      scores.assignment_id,
      COALESCE(scores.selected_action_id, scores.action_id) AS action_id,
      scores.selected_action_id,
      scores.confidence_score,
      scores.confidence_date,
      scores.confidence_late,
      scores.confidence_source,
      scores.performance_score,
      scores.performance_date,
      scores.performance_late,
      scores.performance_source,
      COALESCE(pm.action_statement, pm2.action_statement, 'Self-Select') AS action_statement,
      COALESCE(c.domain_id, c2.domain_id) AS domain_id,
      COALESCE(d.domain_name, d2.domain_name, 'General') AS domain_name,
      scores.display_order,
      scores.self_select,
      scores.is_exempt
    FROM scores_data scores
    LEFT JOIN pro_moves pm ON pm.action_id = scores.action_id
    LEFT JOIN pro_moves pm2 ON pm2.action_id = scores.selected_action_id
    LEFT JOIN competencies c ON c.competency_id = pm.competency_id
    LEFT JOIN competencies c2 ON c2.competency_id = pm2.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN domains d2 ON d2.domain_id = c2.domain_id
  )
  SELECT
    es.staff_id,
    es.staff_name,
    es.staff_email,
    es.user_id,
    es.role_id,
    es.role_name,
    es.location_id,
    es.location_name,
    es.organization_id,
    es.organization_name,
    es.score_id,
    es.week_start_date AS week_of,
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
    es.action_statement,
    es.domain_id,
    es.domain_name,
    es.display_order,
    es.self_select,
    es.is_exempt
  FROM enriched_scores es
  ORDER BY es.week_start_date DESC, es.display_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
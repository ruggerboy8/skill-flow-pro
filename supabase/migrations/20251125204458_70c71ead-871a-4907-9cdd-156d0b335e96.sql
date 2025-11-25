-- Create new RPC for individual users to get their own weekly scores
-- This handles both weekly_assignments (new system) and weekly_focus (legacy system)
CREATE OR REPLACE FUNCTION public.get_my_weekly_scores(p_week_of text DEFAULT NULL)
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
  self_select boolean,
  is_week_exempt boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_staff_id uuid;
  v_staff_record RECORD;
  v_target_monday date;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get staff record for this user
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
  WHERE s.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_staff_id := v_staff_record.staff_id;

  -- Parse week_of to Monday if provided
  IF p_week_of IS NOT NULL THEN
    v_target_monday := date_trunc('week', p_week_of::date)::date;
    
    -- Check if this week is exempt - return empty if so
    IF EXISTS (
      SELECT 1 FROM excused_weeks 
      WHERE week_start_date = v_target_monday
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH 
  -- Get scores from new weekly_assignments system
  assignment_scores AS (
    SELECT
      wa.id::text AS assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order,
      EXISTS(SELECT 1 FROM excused_weeks WHERE week_start_date = wa.week_start_date) AS is_exempt,
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
        THEN ws.confidence_date > (wa.week_start_date + INTERVAL '1 day 15 hours')
        ELSE NULL
      END AS confidence_late,
      CASE
        WHEN ws.performance_date IS NOT NULL
        THEN ws.performance_date > (wa.week_start_date + INTERVAL '4 days 17 hours')
        ELSE NULL
      END AS performance_late
    FROM weekly_assignments wa
    LEFT JOIN weekly_scores ws
      ON ws.staff_id = v_staff_id
      AND ws.assignment_id = ('assign:' || wa.id)
    WHERE wa.role_id = v_staff_record.role_id
      AND wa.status = 'locked'
      AND (p_week_of IS NULL OR wa.week_start_date = v_target_monday)
      AND (
        wa.location_id = v_staff_record.location_id
        OR (wa.location_id IS NULL AND wa.org_id = v_staff_record.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
  ),
  -- Get scores from legacy weekly_focus system
  focus_scores AS (
    SELECT
      wf.id::text AS assignment_id,
      wf.week_start_date,
      wf.action_id,
      pm.competency_id,
      wf.self_select,
      wf.display_order,
      EXISTS(SELECT 1 FROM excused_weeks WHERE week_start_date = wf.week_start_date) AS is_exempt,
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
        THEN ws.confidence_date > (wf.week_start_date + INTERVAL '1 day 15 hours')
        ELSE NULL
      END AS confidence_late,
      CASE
        WHEN ws.performance_date IS NOT NULL
        THEN ws.performance_date > (wf.week_start_date + INTERVAL '4 days 17 hours')
        ELSE NULL
      END AS performance_late
    FROM weekly_focus wf
    LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
    LEFT JOIN weekly_scores ws
      ON ws.staff_id = v_staff_id
      AND ws.weekly_focus_id = wf.id::text
    WHERE wf.role_id = v_staff_record.role_id
      AND (p_week_of IS NULL OR wf.week_start_date = v_target_monday)
      -- Only include focus records that have scores
      AND ws.id IS NOT NULL
  ),
  -- Combine both sources
  all_scores AS (
    SELECT * FROM assignment_scores
    UNION ALL
    SELECT * FROM focus_scores
  ),
  -- Enrich with pro_moves and domain data
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
    FROM all_scores scores
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
$$;

-- Rename the old broken RPC to mark it as deprecated
ALTER FUNCTION public.get_staff_all_weekly_scores(uuid) 
RENAME TO get_staff_all_weekly_scores_deprecated;
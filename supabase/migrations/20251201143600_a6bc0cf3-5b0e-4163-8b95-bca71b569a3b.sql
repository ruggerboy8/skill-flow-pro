
-- Fix get_staff_weekly_scores to return assignment_id with 'assign:' prefix
-- Drop and recreate function to change assignment_id type from uuid to text

DROP FUNCTION IF EXISTS public.get_staff_weekly_scores(uuid, text);

CREATE FUNCTION public.get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of text DEFAULT NULL
)
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
  confidence_date timestamp with time zone,
  confidence_late boolean,
  confidence_source text,
  performance_score integer,
  performance_date timestamp with time zone,
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_authorized boolean;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_target_monday date;
BEGIN
  -- Check if user has coach/lead/admin privileges
  SELECT 
    (s.is_coach OR s.is_lead OR s.is_super_admin),
    s.coach_scope_type, 
    s.coach_scope_id::uuid
  INTO v_is_authorized, v_coach_scope_type, v_coach_scope_id
  FROM staff s
  WHERE s.user_id = p_coach_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_authorized, false) THEN
    RAISE EXCEPTION 'User is not a coach, lead, or super admin';
  END IF;

  -- Parse week_of to Monday
  IF p_week_of IS NOT NULL THEN
    v_target_monday := date_trunc('week', p_week_of::date)::date;
  END IF;

  RETURN QUERY
  WITH coach_visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    LEFT JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        (v_coach_scope_type = 'organization' AND l.organization_id = v_coach_scope_id)
        OR (v_coach_scope_type = 'location' AND s.primary_location_id = v_coach_scope_id)
        OR (v_coach_scope_type IS NULL)
      )
  ),
  staff_data AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.email AS staff_email,
      s.user_id AS user_id,
      s.role_id::bigint,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.organization_id,
      o.name AS organization_name
    FROM coach_visible_staff cvs
    INNER JOIN staff s ON s.id = cvs.staff_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
  ),
  applicable_assignments AS (
    SELECT
      sd.staff_id,
      wa.id AS assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order
    FROM staff_data sd
    INNER JOIN weekly_assignments wa
      ON wa.role_id = sd.role_id
      AND wa.status = 'locked'
      AND (p_week_of IS NULL OR wa.week_start_date = v_target_monday)
      AND (
        wa.location_id = sd.location_id
        OR (wa.location_id IS NULL AND wa.org_id = sd.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
  ),
  scores_data AS (
    SELECT
      aa.staff_id,
      aa.assignment_id,
      aa.week_start_date,
      aa.action_id,
      aa.competency_id,
      aa.self_select,
      aa.display_order,
      ws.id AS score_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_source::text,
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
      ON ws.staff_id = aa.staff_id
      AND ws.assignment_id = ('assign:' || aa.assignment_id)
  ),
  enriched_scores AS (
    SELECT
      sd.staff_id,
      sd.staff_name,
      sd.staff_email,
      sd.user_id,
      sd.role_id,
      sd.role_name,
      sd.location_id,
      sd.location_name,
      sd.organization_id,
      sd.organization_name,
      scores.score_id,
      scores.week_start_date,
      ('assign:' || scores.assignment_id) AS assignment_id,
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
      scores.self_select
    FROM staff_data sd
    INNER JOIN scores_data scores ON scores.staff_id = sd.staff_id
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
    es.self_select
  FROM enriched_scores es
  ORDER BY es.staff_name, es.display_order;
END;
$function$;

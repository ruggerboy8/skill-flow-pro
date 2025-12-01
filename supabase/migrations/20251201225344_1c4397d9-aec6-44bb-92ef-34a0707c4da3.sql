-- Drop and recreate get_staff_weekly_scores with working structure + onboarding filter
DROP FUNCTION IF EXISTS public.get_staff_weekly_scores(uuid, text);

CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(
  p_coach_user_id uuid,
  p_week_of text DEFAULT NULL
)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id integer,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  score_id text,
  week_of date,
  assignment_id text,
  action_id integer,
  selected_action_id integer,
  confidence_score integer,
  confidence_date timestamptz,
  confidence_late boolean,
  confidence_source text,
  performance_score integer,
  performance_date timestamptz,
  performance_late boolean,
  performance_source text,
  action_statement text,
  domain_id integer,
  domain_name text,
  display_order integer,
  self_select boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target_week_start date;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
BEGIN
  -- Determine target week
  IF p_week_of IS NOT NULL AND p_week_of != 'current' THEN
    v_target_week_start := p_week_of::date;
  ELSE
    v_target_week_start := date_trunc('week', CURRENT_DATE)::date;
  END IF;

  -- Get coach scope using DECLARE variables (avoids subquery ambiguity)
  SELECT s.coach_scope_type, s.coach_scope_id::uuid
  INTO v_coach_scope_type, v_coach_scope_id
  FROM staff s
  WHERE s.user_id = p_coach_user_id
  LIMIT 1;

  RETURN QUERY
  WITH staff_in_scope AS (
    SELECT DISTINCT
      s.id AS staff_id,
      s.name AS staff_name,
      s.email AS staff_email,
      s.user_id,
      s.role_id,
      r.role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      l.organization_id,
      o.name AS organization_name
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND (
        (v_coach_scope_type = 'organization' AND l.organization_id = v_coach_scope_id) OR
        (v_coach_scope_type = 'location' AND s.primary_location_id = v_coach_scope_id)
      )
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
      wa.display_order,
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
      wf.display_order,
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
      aa.display_order,
      aa.assignment_id,
      aa.weekly_focus_id,
      ws.id AS score_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text,
      ws.selected_action_id
    FROM applicable_assignments aa
    LEFT JOIN weekly_scores ws ON (
      ws.staff_id = aa.staff_id
      AND ws.week_of = aa.week_start_date
      AND (
        (aa.assignment_id IS NOT NULL AND ws.assignment_id = ('assign:' || aa.assignment_id::text))
        OR (aa.weekly_focus_id IS NOT NULL AND ws.weekly_focus_id = aa.weekly_focus_id::text)
        OR (ws.site_action_id = aa.action_id AND ws.assignment_id IS NULL AND ws.weekly_focus_id IS NULL)
      )
    )
  ),
  enriched_scores AS (
    SELECT
      sd.staff_id,
      sd.staff_name,
      sd.staff_email,
      sd.user_id,
      sd.role_id::int,
      sd.role_name,
      sd.location_id,
      sd.location_name,
      sd.organization_id,
      sd.organization_name,
      scores.score_id::text,
      scores.week_start_date AS week_of,
      CASE 
        WHEN scores.assignment_id IS NOT NULL THEN ('assign:' || scores.assignment_id::text)
        ELSE NULL
      END AS assignment_id,
      COALESCE(scores.action_id, c.action_id)::int AS action_id,
      scores.selected_action_id::int,
      scores.confidence_score::int,
      scores.confidence_date,
      scores.confidence_late,
      scores.confidence_source,
      scores.performance_score::int,
      scores.performance_date,
      scores.performance_late,
      scores.performance_source,
      pm.action_statement,
      c.domain_id::int,
      d.domain_name,
      scores.display_order::int,
      scores.self_select
    FROM scores_data scores
    INNER JOIN staff_in_scope sd ON sd.staff_id = scores.staff_id
    LEFT JOIN competencies c ON c.competency_id = scores.competency_id
    LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(scores.action_id, c.action_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
  )
  SELECT * FROM enriched_scores
  ORDER BY staff_name, week_of;
END;
$function$;
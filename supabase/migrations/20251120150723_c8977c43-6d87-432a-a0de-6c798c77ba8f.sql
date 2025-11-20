-- Drop existing function
DROP FUNCTION IF EXISTS public.get_best_weekly_win(uuid);

-- Create function to get the best weekly win for a staff member
CREATE OR REPLACE FUNCTION public.get_best_weekly_win(p_staff_id uuid)
RETURNS TABLE(
  week_of text,
  action_statement text,
  domain_name text,
  lift_amount int,
  win_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH recent_weeks AS (
    -- Get last 4 weeks with scores
    SELECT DISTINCT
      ws.week_of,
      wf.cycle,
      wf.week_in_cycle,
      s.role_id
    FROM weekly_scores ws
    LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
    JOIN staff s ON s.id = ws.staff_id
    WHERE ws.staff_id = p_staff_id
      AND ws.week_of IS NOT NULL
      AND ws.week_of >= CURRENT_DATE - INTERVAL '4 weeks'
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
    ORDER BY ws.week_of DESC
    LIMIT 4
  ),
  week_scores AS (
    -- Get all scores for these weeks with lift calculation
    SELECT
      rw.week_of,
      pm.action_statement,
      d.domain_name,
      ws.confidence_score,
      ws.performance_score,
      (ws.performance_score - ws.confidence_score) as lift,
      wf.display_order
    FROM recent_weeks rw
    JOIN weekly_scores ws ON ws.week_of = rw.week_of AND ws.staff_id = p_staff_id
    LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
    LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(ws.selected_action_id, ws.site_action_id)
    LEFT JOIN competencies c ON c.competency_id = pm.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND pm.action_statement IS NOT NULL
  ),
  perfect_weeks AS (
    -- Find perfect weeks (all 4s)
    SELECT
      week_of,
      MIN(action_statement) as action_statement,
      MIN(domain_name) as domain_name,
      0 as lift_amount,
      'perfect' as win_type,
      1 as priority
    FROM week_scores
    GROUP BY week_of
    HAVING bool_and(performance_score = 4)
    ORDER BY week_of DESC
    LIMIT 1
  ),
  growth_weeks AS (
    -- Find growth wins (lift >= 1)
    SELECT
      week_of,
      action_statement,
      domain_name,
      lift as lift_amount,
      'growth' as win_type,
      2 as priority
    FROM week_scores
    WHERE lift >= 1
    ORDER BY lift DESC, week_of DESC
    LIMIT 1
  ),
  all_wins AS (
    SELECT * FROM perfect_weeks
    UNION ALL
    SELECT * FROM growth_weeks
  )
  SELECT
    aw.week_of::text,
    aw.action_statement,
    aw.domain_name,
    aw.lift_amount,
    aw.win_type
  FROM all_wins aw
  ORDER BY aw.priority
  LIMIT 1;
END;
$function$;
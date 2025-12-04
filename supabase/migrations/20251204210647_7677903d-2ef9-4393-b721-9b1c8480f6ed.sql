
-- Phase 2: Create function to get lowest-confidence Pro Moves by location
CREATE OR REPLACE FUNCTION get_location_skill_gaps(
  p_location_id uuid,
  p_lookback_weeks int DEFAULT 6,
  p_limit_per_role int DEFAULT 3
)
RETURNS TABLE (
  action_id bigint,
  action_statement text,
  role_id bigint,
  role_name text,
  domain_name text,
  avg_confidence numeric,
  staff_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff_date date;
BEGIN
  v_cutoff_date := CURRENT_DATE - (p_lookback_weeks * 7);
  
  RETURN QUERY
  WITH location_scores AS (
    -- Get all confidence scores for staff at this location in the lookback window
    SELECT 
      wa.action_id,
      wa.role_id,
      ws.confidence_score,
      ws.staff_id
    FROM weekly_scores ws
    JOIN staff s ON s.id = ws.staff_id
    JOIN weekly_assignments wa ON ws.assignment_id = ('assign:' || wa.id::text)
    WHERE s.primary_location_id = p_location_id
      AND ws.week_of >= v_cutoff_date
      AND ws.confidence_score IS NOT NULL
      AND wa.action_id IS NOT NULL
  ),
  aggregated AS (
    -- Group by action and role, calculate avg confidence
    SELECT 
      ls.action_id,
      ls.role_id,
      ROUND(AVG(ls.confidence_score)::numeric, 2) AS avg_conf,
      COUNT(DISTINCT ls.staff_id) AS staff_cnt
    FROM location_scores ls
    GROUP BY ls.action_id, ls.role_id
    HAVING COUNT(*) >= 2  -- Only include if at least 2 data points
  ),
  ranked AS (
    -- Rank by lowest confidence within each role
    SELECT 
      a.*,
      ROW_NUMBER() OVER (PARTITION BY a.role_id ORDER BY a.avg_conf ASC) as rn
    FROM aggregated a
  )
  SELECT 
    r.action_id,
    pm.action_statement,
    r.role_id,
    ro.role_name,
    d.domain_name,
    r.avg_conf AS avg_confidence,
    r.staff_cnt AS staff_count
  FROM ranked r
  JOIN pro_moves pm ON pm.action_id = r.action_id
  LEFT JOIN competencies c ON c.competency_id = pm.competency_id
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  JOIN roles ro ON ro.role_id = r.role_id
  WHERE r.rn <= p_limit_per_role
  ORDER BY r.role_id, r.avg_conf ASC;
END;
$$;

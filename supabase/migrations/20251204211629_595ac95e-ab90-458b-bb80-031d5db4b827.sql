
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
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH location_scores AS (
    SELECT 
      ws.site_action_id AS action_id,
      ws.confidence_score,
      s.role_id
    FROM weekly_scores ws
    JOIN staff s ON s.id = ws.staff_id
    WHERE s.primary_location_id = p_location_id
      AND ws.week_of >= CURRENT_DATE - (p_lookback_weeks || ' weeks')::interval
      AND ws.confidence_score IS NOT NULL
      AND ws.site_action_id IS NOT NULL
  ),
  aggregated AS (
    SELECT 
      ls.action_id,
      ls.role_id,
      AVG(ls.confidence_score)::numeric(3,2) AS avg_confidence,
      COUNT(DISTINCT ls.confidence_score) AS staff_count
    FROM location_scores ls
    GROUP BY ls.action_id, ls.role_id
  ),
  ranked AS (
    SELECT 
      a.action_id,
      a.role_id,
      a.avg_confidence,
      a.staff_count,
      ROW_NUMBER() OVER (PARTITION BY a.role_id ORDER BY a.avg_confidence ASC) AS rn
    FROM aggregated a
  )
  SELECT 
    r.action_id,
    pm.action_statement,
    r.role_id,
    ro.role_name,
    d.domain_name,
    r.avg_confidence,
    r.staff_count
  FROM ranked r
  JOIN pro_moves pm ON pm.action_id = r.action_id
  JOIN competencies c ON c.competency_id = pm.competency_id
  JOIN domains d ON d.domain_id = c.domain_id
  JOIN roles ro ON ro.role_id = r.role_id
  WHERE r.rn <= p_limit_per_role
  ORDER BY r.role_id, r.avg_confidence ASC;
$$;

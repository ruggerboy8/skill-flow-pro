-- Create unified view for action usage stats that handles both weekly_focus and weekly_plan sources
CREATE OR REPLACE VIEW action_usage_stats AS
WITH unified_scores AS (
  -- From weekly_focus (Cycles 1-3)
  SELECT 
    ws.staff_id,
    wf.role_id,
    wf.action_id,
    wf.week_start_date,
    ws.confidence_score,
    ws.confidence_date,
    1 as attempt_count
  FROM weekly_scores ws
  JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
  WHERE ws.confidence_score IS NOT NULL
    AND wf.action_id IS NOT NULL
  
  UNION ALL
  
  -- From weekly_plan (Cycle 4+)
  SELECT 
    ws.staff_id,
    wp.role_id,
    wp.action_id,
    wp.week_start_date,
    ws.confidence_score,
    ws.confidence_date,
    1 as attempt_count
  FROM weekly_scores ws
  JOIN weekly_plan wp ON ('plan:' || wp.id::text) = ws.weekly_focus_id
  WHERE ws.confidence_score IS NOT NULL
    AND wp.action_id IS NOT NULL
)
SELECT 
  role_id,
  action_id,
  COUNT(DISTINCT staff_id) as unique_users,
  COUNT(*) as total_attempts,
  AVG(confidence_score / 10.0) as avg_confidence,
  MIN(week_start_date) as first_assigned,
  MAX(week_start_date) as last_assigned,
  COUNT(DISTINCT week_start_date) as weeks_assigned
FROM unified_scores
WHERE week_start_date >= CURRENT_DATE - INTERVAL '9 weeks'
GROUP BY role_id, action_id;

-- Grant access to authenticated users
GRANT SELECT ON action_usage_stats TO authenticated, anon;

COMMENT ON VIEW action_usage_stats IS 'Unified view of pro-move usage across both weekly_focus and weekly_plan, showing aggregated confidence and practice stats for the last 9 weeks';
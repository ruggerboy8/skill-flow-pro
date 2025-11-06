-- Create unified usage view for pro-move usage across legacy and plan-backed weeks
CREATE OR REPLACE VIEW pro_move_usage_view AS
WITH plan_scores AS (
  SELECT
    wp.action_id,
    ws.confidence_score,
    ws.created_at::date AS score_date
  FROM weekly_scores ws
  JOIN weekly_plan wp ON ws.weekly_focus_id = ('plan:' || wp.id)
  WHERE ws.confidence_score IS NOT NULL
    AND wp.action_id IS NOT NULL
),
legacy_scores AS (
  SELECT
    wf.action_id,
    ws.confidence_score,
    ws.created_at::date AS score_date
  FROM weekly_scores ws
  JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id::text
  WHERE ws.confidence_score IS NOT NULL
    AND wf.action_id IS NOT NULL
)
SELECT 
  action_id,
  COUNT(*)::integer AS attempts,
  AVG(confidence_score)::float AS avg_confidence,
  MAX(score_date) AS last_score_date
FROM (
  SELECT * FROM plan_scores
  UNION ALL
  SELECT * FROM legacy_scores
) u
GROUP BY action_id;

-- Grant access
GRANT SELECT ON pro_move_usage_view TO authenticated, anon;

COMMENT ON VIEW pro_move_usage_view IS 'Unified view of pro-move usage showing attempts, average confidence, and last score date across both legacy weekly_focus and new weekly_plan systems';
-- Fix legacy scores without action IDs by matching to any assignment in their week
UPDATE weekly_scores ws
SET assignment_id = 'assign:' || wa.id::text
FROM (
  SELECT DISTINCT ON (ws2.id)
    ws2.id as score_id,
    wa2.id as assignment_id
  FROM weekly_scores ws2
  JOIN staff s ON s.id = ws2.staff_id
  JOIN weekly_assignments wa2 ON 
    wa2.week_start_date = ws2.week_of
    AND wa2.role_id = s.role_id
    AND wa2.location_id = s.primary_location_id
    AND wa2.status = 'locked'
  WHERE ws2.site_action_id IS NULL
    AND ws2.selected_action_id IS NULL
    AND ws2.week_of IS NOT NULL
  ORDER BY ws2.id, wa2.display_order
) matched
JOIN weekly_assignments wa ON wa.id = matched.assignment_id
WHERE ws.id = matched.score_id;
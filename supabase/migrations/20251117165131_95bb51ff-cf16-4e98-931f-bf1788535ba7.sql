-- Fix weekly_scores.week_of to match actual week start dates
-- Update scores linked to weekly_focus
UPDATE weekly_scores ws
SET week_of = wf.week_start_date
FROM weekly_focus wf
WHERE wf.id::text = ws.weekly_focus_id
  AND ws.week_of IS DISTINCT FROM wf.week_start_date;

-- Update scores linked to weekly_plan (using plan:id format)
UPDATE weekly_scores ws
SET week_of = wp.week_start_date
FROM weekly_plan wp
WHERE ws.weekly_focus_id LIKE 'plan:%'
  AND ws.weekly_focus_id = 'plan:' || wp.id::text
  AND ws.week_of IS DISTINCT FROM wp.week_start_date;
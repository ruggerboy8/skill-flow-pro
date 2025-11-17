
-- Clean up orphaned weekly_scores where weekly_focus_id references non-existent weekly_focus rows
-- This handles the TEXT field properly and skips the new 'plan:' format

DELETE FROM weekly_scores
WHERE weekly_focus_id IS NOT NULL 
  AND weekly_focus_id NOT LIKE 'plan:%'
  AND NOT EXISTS (
    SELECT 1 
    FROM weekly_focus wf 
    WHERE wf.id::text = weekly_focus_id
  );

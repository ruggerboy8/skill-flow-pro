-- Fix hybrid records where assignment_id is correct (assign:xxx) but weekly_focus_id is old UUID format
-- This affects ~15 records for 5 staff members who submitted confidence on 2025-12-01 with an older app version

UPDATE weekly_scores
SET weekly_focus_id = assignment_id,
    updated_at = now()
WHERE week_of = '2025-12-01'
  AND assignment_id LIKE 'assign:%'
  AND (weekly_focus_id IS NULL OR weekly_focus_id NOT LIKE 'assign:%')
  AND (weekly_focus_id IS NULL OR assignment_id != weekly_focus_id);
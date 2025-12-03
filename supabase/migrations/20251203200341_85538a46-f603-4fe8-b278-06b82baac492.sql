-- Step 1: Delete duplicate scores (keep oldest one per assignment+staff)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY staff_id, assignment_id ORDER BY created_at ASC) as rn
  FROM weekly_scores
  WHERE assignment_id LIKE 'assign:%'
    AND confidence_source = 'backfill_historical'
)
DELETE FROM weekly_scores
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Step 2: Fix week_of to match assignment week_start_date
UPDATE weekly_scores ws
SET week_of = wa.week_start_date
FROM weekly_assignments wa
WHERE ws.assignment_id = 'assign:' || wa.id::text
  AND ws.confidence_source = 'backfill_historical'
  AND ws.week_of IS DISTINCT FROM wa.week_start_date;
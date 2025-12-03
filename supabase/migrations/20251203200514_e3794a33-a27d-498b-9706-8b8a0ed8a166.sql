-- Delete duplicates first
DELETE FROM weekly_scores
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY staff_id, assignment_id ORDER BY created_at ASC) as rn
    FROM weekly_scores
    WHERE assignment_id LIKE 'assign:%'
      AND confidence_source = 'backfill_historical'
  ) dupes
  WHERE rn > 1
);

-- Fix week_of
UPDATE weekly_scores 
SET week_of = (
  SELECT wa.week_start_date 
  FROM weekly_assignments wa 
  WHERE weekly_scores.assignment_id = 'assign:' || wa.id::text
  LIMIT 1
)
WHERE confidence_source = 'backfill_historical'
  AND assignment_id LIKE 'assign:%';
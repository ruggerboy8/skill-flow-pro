-- Step 1: Delete duplicate weekly_scores, keeping only the most recent for each (staff_id, assignment_id)
WITH ranked_scores AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY staff_id, assignment_id 
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) as rn
  FROM weekly_scores
  WHERE assignment_id IS NOT NULL
)
DELETE FROM weekly_scores
WHERE id IN (
  SELECT id FROM ranked_scores WHERE rn > 1
);

-- Step 2: Add unique constraint on (staff_id, assignment_id) for V2 mode
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_scores_staff_assignment 
ON weekly_scores(staff_id, assignment_id) 
WHERE assignment_id IS NOT NULL;
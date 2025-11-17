
-- Add week_of column to weekly_scores for clearer week tracking
ALTER TABLE weekly_scores 
ADD COLUMN IF NOT EXISTS week_of date;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_weekly_scores_week_of ON weekly_scores(week_of);

-- Backfill week_of for existing records based on weekly_focus
UPDATE weekly_scores ws
SET week_of = (
  SELECT wf.week_start_date
  FROM weekly_focus wf
  WHERE wf.id::text = ws.weekly_focus_id
    AND ws.weekly_focus_id NOT LIKE 'plan:%'
)
WHERE week_of IS NULL 
  AND weekly_focus_id NOT LIKE 'plan:%';

-- For plan-based scores, derive from the plan table
UPDATE weekly_scores ws
SET week_of = (
  SELECT wp.week_start_date
  FROM weekly_plan wp
  WHERE ('plan:' || wp.id::text) = ws.weekly_focus_id
)
WHERE week_of IS NULL 
  AND weekly_focus_id LIKE 'plan:%';

COMMENT ON COLUMN weekly_scores.week_of IS 'Monday date of the week this score belongs to, for reliable week identification';

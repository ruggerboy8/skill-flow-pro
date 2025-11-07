-- Add competency_id column to weekly_plan table
ALTER TABLE weekly_plan 
ADD COLUMN competency_id bigint REFERENCES competencies(competency_id);

-- Create index for better query performance
CREATE INDEX idx_weekly_plan_competency ON weekly_plan(competency_id);

-- Backfill existing data: populate competency_id from pro_moves
UPDATE weekly_plan wp
SET competency_id = pm.competency_id
FROM pro_moves pm
WHERE wp.action_id = pm.action_id
  AND wp.competency_id IS NULL;
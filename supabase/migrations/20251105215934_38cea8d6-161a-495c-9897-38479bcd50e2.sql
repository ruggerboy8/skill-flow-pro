-- Migration: Support plan-based focus IDs and normalize status vocabulary

-- ============================================
-- Part 1: Drop dependent views
-- ============================================

DROP VIEW IF EXISTS view_weekly_scores_with_competency;

-- ============================================
-- Part 2: weekly_scores.weekly_focus_id → TEXT
-- ============================================

-- Drop existing foreign key constraint
ALTER TABLE weekly_scores 
  DROP CONSTRAINT IF EXISTS weekly_scores_weekly_focus_id_fkey;

-- Change column type from uuid to text
ALTER TABLE weekly_scores 
  ALTER COLUMN weekly_focus_id TYPE text 
  USING weekly_focus_id::text;

-- Add check constraint to validate ID formats
-- Accepts: plan:<bigint> OR valid uuid format
ALTER TABLE weekly_scores
  ADD CONSTRAINT weekly_focus_id_format_check
  CHECK (
    weekly_focus_id ~ '^plan:[0-9]+$' OR 
    weekly_focus_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- Create index for performance
DROP INDEX IF EXISTS idx_weekly_scores_weekly_focus_id;
CREATE INDEX idx_weekly_scores_focus_id ON weekly_scores(weekly_focus_id);

-- Add unique constraint to prevent duplicate scores for same staff/focus
ALTER TABLE weekly_scores
  DROP CONSTRAINT IF EXISTS uq_weekly_scores_staff_focus;
ALTER TABLE weekly_scores
  ADD CONSTRAINT uq_weekly_scores_staff_focus
  UNIQUE (staff_id, weekly_focus_id);

-- ============================================
-- Part 3: Recreate view with hybrid support
-- ============================================

CREATE OR REPLACE VIEW view_weekly_scores_with_competency AS
SELECT
  ws.id                         AS weekly_score_id,
  ws.staff_id,
  s.role_id,
  s.primary_location_id,
  loc.organization_id,
  ws.weekly_focus_id,
  -- Handle both plan: IDs (from weekly_plan) and UUIDs (from weekly_focus)
  COALESCE(
    ws.selected_action_id, 
    wp.action_id,  -- from weekly_plan if plan: ID
    wf.action_id   -- from weekly_focus if UUID
  ) AS action_id,
  pm.competency_id,
  c.domain_id,
  COALESCE(d.domain_name, 'Unassigned') AS domain_name,
  ws.confidence_score,
  ws.performance_score,
  ws.created_at
FROM weekly_scores ws
JOIN staff s ON s.id = ws.staff_id
LEFT JOIN locations loc ON loc.id = s.primary_location_id
-- Join to weekly_focus for legacy UUID-based IDs
LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id 
  AND ws.weekly_focus_id !~ '^plan:'
-- Join to weekly_plan for plan:<id> based IDs
LEFT JOIN weekly_plan wp ON ('plan:' || wp.id) = ws.weekly_focus_id
-- Get competency info from action_id
LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(ws.selected_action_id, wp.action_id, wf.action_id)
LEFT JOIN competencies c ON c.competency_id = pm.competency_id
LEFT JOIN domains d ON d.domain_id = c.domain_id
WHERE pm.competency_id IS NOT NULL;

-- ============================================
-- Part 4: Normalize weekly_plan.status vocabulary
-- ============================================

-- Convert any 'draft' status to 'proposed'
UPDATE weekly_plan 
  SET status = 'proposed' 
  WHERE status = 'draft';

-- Drop old check constraint if exists
ALTER TABLE weekly_plan
  DROP CONSTRAINT IF EXISTS weekly_plan_status_check;

-- Add new check constraint: only 'proposed' or 'locked'
ALTER TABLE weekly_plan
  ADD CONSTRAINT weekly_plan_status_check
  CHECK (status IN ('proposed', 'locked'));
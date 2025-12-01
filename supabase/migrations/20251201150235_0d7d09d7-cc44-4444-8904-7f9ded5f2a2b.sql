-- Drop the existing constraint that only allows plan:<number> and raw UUID formats
ALTER TABLE weekly_scores 
  DROP CONSTRAINT IF EXISTS weekly_focus_id_format_check;

-- Add updated check constraint that accepts all three formats:
-- 1. plan:<number> for weekly_plan references
-- 2. Raw UUID for legacy weekly_focus references  
-- 3. assign:<uuid> for V2 weekly_assignments references
ALTER TABLE weekly_scores
  ADD CONSTRAINT weekly_focus_id_format_check
  CHECK (
    weekly_focus_id ~ '^plan:[0-9]+$' OR 
    weekly_focus_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
    weekly_focus_id ~ '^assign:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
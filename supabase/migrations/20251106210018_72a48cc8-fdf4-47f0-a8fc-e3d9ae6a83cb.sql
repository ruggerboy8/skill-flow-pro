-- A) Prep & DB checks: Ensure weekly_plan has all required columns and constraints

-- 1. Ensure weekly_scores.weekly_focus_id index exists
CREATE INDEX IF NOT EXISTS idx_weekly_scores_focusid ON weekly_scores (weekly_focus_id);

-- 2. Add unique constraint for global weekly_plan (org_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plan_global
  ON weekly_plan(role_id, week_start_date, display_order)
  WHERE org_id IS NULL;

-- 3. Add missing columns to weekly_plan (if not exist)
ALTER TABLE weekly_plan
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS self_select boolean DEFAULT false;

-- 4. Add trigger to prevent updates when scores exist
CREATE OR REPLACE FUNCTION prevent_update_if_scores()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM weekly_scores
    WHERE weekly_focus_id = 'plan:' || OLD.id
  ) THEN
    RAISE EXCEPTION 'Cannot modify slot with submitted scores';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

DROP TRIGGER IF EXISTS trg_prevent_update_if_scores ON weekly_plan;
CREATE TRIGGER trg_prevent_update_if_scores
BEFORE UPDATE ON weekly_plan
FOR EACH ROW
WHEN (OLD.org_id IS NULL AND OLD.action_id IS DISTINCT FROM NEW.action_id)
EXECUTE FUNCTION prevent_update_if_scores();
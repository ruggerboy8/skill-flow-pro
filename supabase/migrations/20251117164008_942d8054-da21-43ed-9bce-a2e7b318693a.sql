
-- Create a trigger to automatically set week_of when weekly_scores are inserted/updated
CREATE OR REPLACE FUNCTION set_week_of()
RETURNS TRIGGER AS $$
BEGIN
  -- If week_of is not set, derive it from weekly_focus_id
  IF NEW.week_of IS NULL THEN
    -- For weekly_focus (UUID), look up the week_start_date
    IF NEW.weekly_focus_id NOT LIKE 'plan:%' THEN
      SELECT wf.week_start_date
      INTO NEW.week_of
      FROM weekly_focus wf
      WHERE wf.id = NEW.weekly_focus_id::uuid;
    ELSE
      -- For weekly_plan (plan:ID format), extract ID and look up
      SELECT wp.week_start_date
      INTO NEW.week_of
      FROM weekly_plan wp
      WHERE wp.id = SUBSTRING(NEW.weekly_focus_id FROM 6)::bigint;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_set_week_of ON weekly_scores;

-- Create the trigger
CREATE TRIGGER trigger_set_week_of
  BEFORE INSERT OR UPDATE ON weekly_scores
  FOR EACH ROW
  EXECUTE FUNCTION set_week_of();

COMMENT ON FUNCTION set_week_of() IS 'Automatically populates week_of column based on weekly_focus_id';

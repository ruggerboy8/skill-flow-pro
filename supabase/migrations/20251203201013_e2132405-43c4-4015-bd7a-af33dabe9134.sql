
-- Create a function to fix backfill scores week_of values (bypasses RLS)
CREATE OR REPLACE FUNCTION fix_backfill_week_of()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE weekly_scores ws
  SET week_of = wa.week_start_date
  FROM weekly_assignments wa
  WHERE ws.assignment_id = 'assign:' || wa.id::text
    AND ws.confidence_source = 'backfill_historical'
    AND ws.week_of = '2025-12-01';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Execute the fix
SELECT fix_backfill_week_of();

-- Drop the function after use
DROP FUNCTION fix_backfill_week_of();

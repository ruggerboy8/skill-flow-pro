
-- Create a permanent function to fix backfill week_of values
CREATE OR REPLACE FUNCTION public.admin_fix_backfill_week_of()
RETURNS TABLE(updated_count integer, sample_staff text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_sample text;
BEGIN
  -- Perform the update
  WITH updated AS (
    UPDATE weekly_scores ws
    SET week_of = wa.week_start_date
    FROM weekly_assignments wa
    WHERE ws.assignment_id = 'assign:' || wa.id::text
      AND ws.confidence_source = 'backfill_historical'
      AND ws.week_of = '2025-12-01'
      AND wa.week_start_date != '2025-12-01'
    RETURNING ws.staff_id
  )
  SELECT COUNT(DISTINCT staff_id), string_agg(DISTINCT staff_id::text, ', ')
  INTO v_count, v_sample
  FROM updated;
  
  updated_count := v_count;
  sample_staff := v_sample;
  RETURN NEXT;
END;
$$;


-- Phase 1: Clean Current Week (Nov 17) Performance Scores
-- Delete performance scores for Cycle 3 Week 6 where submission date < Nov 17
-- This ensures all staff can submit performance scores Thursday for the correct pro-moves
-- Confidence scores remain untouched (authentic signals preserved)

DO $$
DECLARE
  v_deleted_count integer;
  v_affected_staff text[];
BEGIN
  -- Log what we're about to delete (for transparency)
  RAISE NOTICE 'Cleaning up mismatched performance scores for Cycle 3 Week 6...';
  
  -- Capture affected staff names for logging
  SELECT array_agg(DISTINCT s.name ORDER BY s.name)
  INTO v_affected_staff
  FROM weekly_scores ws
  JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
  JOIN staff s ON s.id = ws.staff_id
  WHERE wf.cycle = 3 
    AND wf.week_in_cycle = 6
    AND ws.performance_score IS NOT NULL
    AND ws.performance_date < '2025-11-17'::date;
  
  -- Delete the mismatched performance scores
  WITH focus_items AS (
    SELECT id::text as focus_id
    FROM weekly_focus
    WHERE cycle = 3 
      AND week_in_cycle = 6
  )
  DELETE FROM weekly_scores
  WHERE weekly_focus_id IN (SELECT focus_id FROM focus_items)
    AND performance_score IS NOT NULL
    AND performance_date < '2025-11-17'::date;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Log results
  RAISE NOTICE 'Deleted % mismatched performance scores', v_deleted_count;
  RAISE NOTICE 'Affected staff: %', COALESCE(array_to_string(v_affected_staff, ', '), 'none');
  RAISE NOTICE 'Staff can now submit performance scores for the correct Nov 17 week pro-moves';
  
END $$;

-- Add a comment to document this cleanup
COMMENT ON TABLE weekly_scores IS 
  'Stores confidence and performance scores for weekly assignments. 
   Phase 1 cleanup (2025-11-18): Removed mismatched performance scores for Cycle 3 Week 6 
   where submission dates were before the week started due to timezone calculation bugs.';


-- Create a function to recover orphaned scores by mapping to current weekly_focus IDs
CREATE OR REPLACE FUNCTION public.recover_orphaned_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recovered_count integer := 0;
  result jsonb;
BEGIN
  -- Recover scores that have site_action_id by matching to current weekly_focus
  WITH orphaned_with_action AS (
    SELECT 
      ws.id as score_id,
      ws.site_action_id,
      s.role_id
    FROM weekly_scores ws
    JOIN staff s ON s.id = ws.staff_id
    WHERE ws.weekly_focus_id NOT LIKE 'plan:%'
      AND ws.site_action_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM weekly_focus wf 
        WHERE wf.id::text = ws.weekly_focus_id
      )
  ),
  best_match AS (
    SELECT DISTINCT ON (owa.score_id)
      owa.score_id,
      wf.id::text as new_focus_id
    FROM orphaned_with_action owa
    JOIN weekly_focus wf 
      ON wf.role_id = owa.role_id
      AND wf.action_id = owa.site_action_id
    ORDER BY owa.score_id, wf.cycle, wf.week_in_cycle
  )
  UPDATE weekly_scores ws
  SET weekly_focus_id = bm.new_focus_id
  FROM best_match bm
  WHERE ws.id = bm.score_id;
  
  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'recovered', recovered_count,
    'message', format('Recovered %s orphaned scores by matching action_id', recovered_count)
  );
  
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.recover_orphaned_scores IS 'Recovers orphaned weekly_scores by remapping to current stable weekly_focus IDs based on action_id matching';

-- Create RPC function for server-side backfill detection
CREATE OR REPLACE FUNCTION public.needs_backfill(p_staff_id uuid, p_role_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  focus_row RECORD;
  missing_weeks integer[] := '{}';
  week_focus_ids uuid[];
  score_row RECORD;
  all_complete boolean;
BEGIN
  -- Pull all weekly_focus ids for Cycle 1, Weeks 1..6 for this role
  FOR focus_row IN 
    SELECT week_in_cycle, array_agg(id) as focus_ids
    FROM weekly_focus
    WHERE cycle = 1 
      AND role_id = p_role_id
      AND week_in_cycle IN (1,2,3,4,5,6)
    GROUP BY week_in_cycle
    ORDER BY week_in_cycle
  LOOP
    -- Check if all focus rows have both scores for this staff
    all_complete := true;
    
    FOR score_row IN 
      SELECT wf.id as focus_id, ws.confidence_score, ws.performance_score
      FROM unnest(focus_row.focus_ids) as wf(id)
      LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id AND ws.staff_id = p_staff_id
    LOOP
      IF score_row.confidence_score IS NULL OR score_row.performance_score IS NULL THEN
        all_complete := false;
        EXIT;
      END IF;
    END LOOP;
    
    IF NOT all_complete THEN
      missing_weeks := array_append(missing_weeks, focus_row.week_in_cycle);
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'missingCount', array_length(missing_weeks, 1),
    'missingWeeks', to_jsonb(missing_weeks)
  );
END;
$$;
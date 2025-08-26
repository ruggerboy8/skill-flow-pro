-- Create the missing retime_backfill_cycle RPC function
CREATE OR REPLACE FUNCTION retime_backfill_cycle(
  p_staff_id UUID,
  p_role_id BIGINT,
  p_cycle INTEGER
) 
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  focus_row RECORD;
  week_offset INTEGER;
  base_timestamp TIMESTAMPTZ;
  confidence_ts TIMESTAMPTZ;
  performance_ts TIMESTAMPTZ;
  updated_count INTEGER := 0;
BEGIN
  -- For each weekly_focus in this cycle/role
  FOR focus_row IN 
    SELECT wf.id as focus_id, wf.week_in_cycle
    FROM weekly_focus wf
    WHERE wf.role_id = p_role_id 
      AND wf.cycle = p_cycle
    ORDER BY wf.week_in_cycle
  LOOP
    -- Calculate base timestamp for this week (assuming program started weeks ago)
    week_offset := (p_cycle - 1) * 6 + focus_row.week_in_cycle - 1;
    base_timestamp := NOW() - INTERVAL '1 week' * week_offset;
    
    -- Set confidence timestamp to mid-week (Wednesday)
    confidence_ts := base_timestamp + INTERVAL '3 days' + 
                    (RANDOM() * INTERVAL '8 hours') + INTERVAL '9 hours';
    
    -- Set performance timestamp to end of week (Friday-Sunday)
    performance_ts := base_timestamp + INTERVAL '5 days' + 
                     (RANDOM() * INTERVAL '2 days') + INTERVAL '9 hours';
    
    -- Update scores that have backfill source
    UPDATE weekly_scores 
    SET 
      confidence_date = confidence_ts,
      performance_date = performance_ts
    WHERE staff_id = p_staff_id 
      AND weekly_focus_id = focus_row.focus_id
      AND (confidence_source = 'backfill'::score_source OR performance_source = 'backfill'::score_source);
    
    GET DIAGNOSTICS updated_count = updated_count + ROW_COUNT;
  END LOOP;
  
  RETURN 'Updated ' || updated_count || ' score timestamps';
END;
$$;
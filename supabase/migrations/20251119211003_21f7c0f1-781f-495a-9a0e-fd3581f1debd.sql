-- Function: get_best_weekly_win
-- Returns the single best 'Growth Event' OR 'Perfect Week' signal for a user
-- Handles both weekly_focus (cycles 1-3) and weekly_plan (cycle 4+) sources

CREATE OR REPLACE FUNCTION public.get_best_weekly_win(p_staff_id uuid)
RETURNS TABLE (
  week_of date,
  action_statement text,
  domain_name text,
  lift_amount integer,
  win_type text  -- 'growth' or 'perfect'
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_growth_record record;
  v_is_perfect boolean;
  v_recent_week date;
BEGIN
  -- PRIORITY 1: SEARCH FOR GROWTH (Breakthrough moments)
  -- Handle both weekly_focus (cycles 1-3) and weekly_plan (cycle 4+)
  
  WITH growth_candidates AS (
    -- From weekly_focus (cycles 1-3, UUID format)
    SELECT 
      ws.week_of,
      pm.action_statement,
      d.domain_name,
      (ws.performance_score - ws.confidence_score) as lift
    FROM weekly_scores ws
    JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id::text
    JOIN pro_moves pm ON wf.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    WHERE ws.staff_id = p_staff_id
      AND ws.week_of >= (CURRENT_DATE - INTERVAL '14 days')
      AND ws.confidence_score IS NOT NULL 
      AND ws.confidence_score <= 2
      AND ws.performance_score IS NOT NULL
      AND ws.performance_score >= 3
      AND wf.action_id IS NOT NULL  -- Exclude self-select slots
    
    UNION ALL
    
    -- From weekly_plan (cycle 4+, "plan:123" format)
    SELECT 
      ws.week_of,
      pm.action_statement,
      d.domain_name,
      (ws.performance_score - ws.confidence_score) as lift
    FROM weekly_scores ws
    JOIN weekly_plan wp ON ws.weekly_focus_id = ('plan:' || wp.id::text)
    JOIN pro_moves pm ON wp.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    WHERE ws.staff_id = p_staff_id
      AND ws.week_of >= (CURRENT_DATE - INTERVAL '14 days')
      AND ws.confidence_score IS NOT NULL 
      AND ws.confidence_score <= 2
      AND ws.performance_score IS NOT NULL
      AND ws.performance_score >= 3
      AND wp.action_id IS NOT NULL  -- Exclude self-select slots
      AND wp.status = 'locked'  -- Only locked plans are active
  )
  SELECT gc.week_of, gc.action_statement, gc.domain_name, gc.lift
  INTO v_growth_record
  FROM growth_candidates gc
  ORDER BY gc.lift DESC, gc.week_of DESC
  LIMIT 1;

  IF v_growth_record IS NOT NULL THEN
    week_of := v_growth_record.week_of;
    action_statement := v_growth_record.action_statement;
    domain_name := v_growth_record.domain_name;
    lift_amount := v_growth_record.lift;
    win_type := 'growth';
    RETURN NEXT;
    RETURN;
  END IF;

  -- PRIORITY 2: SEARCH FOR PERFECT WEEK
  -- Check if most recent completed week had all 4s
  SELECT MAX(week_of) INTO v_recent_week
  FROM weekly_scores 
  WHERE staff_id = p_staff_id
    AND performance_score IS NOT NULL;

  IF v_recent_week IS NULL THEN
    RETURN;  -- No completed weeks
  END IF;

  -- Count how many scores exist for that week and how many are perfect
  SELECT 
    (COUNT(*) FILTER (WHERE performance_score = 4)) = COUNT(*) 
    AND COUNT(*) >= 2  -- Must have at least 2 completed assignments
  INTO v_is_perfect
  FROM weekly_scores
  WHERE staff_id = p_staff_id
    AND week_of = v_recent_week
    AND performance_score IS NOT NULL;

  IF v_is_perfect THEN
    week_of := v_recent_week;
    action_statement := 'You maintained a perfect 4.0 standard across all Pro-Moves.';
    domain_name := 'Consistency';
    lift_amount := 0;
    win_type := 'perfect';
    RETURN NEXT;
  END IF;

  -- PRIORITY 3: Return nothing (banner stays hidden)
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_best_weekly_win(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_best_weekly_win IS 
'Returns the single best weekly achievement for a staff member. Prioritizes growth (lift > 0) over perfect weeks. Handles both weekly_focus and weekly_plan sources.';
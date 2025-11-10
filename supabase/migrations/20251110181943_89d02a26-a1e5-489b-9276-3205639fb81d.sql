-- Fix get_calendar_week_status to show only ONE cycle-week per calendar date
DROP FUNCTION IF EXISTS public.get_calendar_week_status(UUID, INT);

CREATE FUNCTION public.get_calendar_week_status(
  p_staff_id UUID,
  p_role_id INT
)
RETURNS TABLE (
  week_of DATE,
  total BIGINT,
  conf_count BIGINT,
  perf_count BIGINT,
  cycle_weeks JSONB,
  source TEXT,
  is_current_week BOOLEAN
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_location_id UUID;
  v_tz TEXT;
  v_current_monday DATE;
BEGIN
  -- Get user's primary location and timezone
  SELECT primary_location_id INTO v_location_id
  FROM staff
  WHERE id = p_staff_id;

  IF v_location_id IS NULL THEN
    RETURN;
  END IF;

  SELECT timezone INTO v_tz
  FROM locations
  WHERE id = v_location_id;

  IF v_tz IS NULL THEN
    v_tz := 'America/Chicago';
  END IF;

  -- Compute current Monday in the location's timezone
  v_current_monday := date_trunc('week', (now() AT TIME ZONE v_tz)::date);

  RETURN QUERY
  WITH onboarding_weeks_all_cycles AS (
    -- Get all cycle-weeks grouped by calendar week
    SELECT 
      wf.week_start_date,
      wf.cycle,
      wf.week_in_cycle,
      COUNT(DISTINCT wf.id) AS total_moves,
      COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN wf.id END) AS conf_moves,
      COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN wf.id END) AS perf_moves,
      ROW_NUMBER() OVER (PARTITION BY wf.week_start_date ORDER BY wf.cycle DESC, wf.week_in_cycle DESC) as rn
    FROM weekly_focus wf
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.role_id = p_role_id AND wf.week_start_date IS NOT NULL
    GROUP BY wf.week_start_date, wf.cycle, wf.week_in_cycle
  ),
  onboarding_weeks AS (
    -- Pick the MOST RECENT cycle-week for each calendar week and aggregate all cycle metadata
    SELECT 
      ow.week_start_date AS week_of,
      ow.total_moves AS total,
      ow.conf_moves AS conf_count,
      ow.perf_moves AS perf_count,
      jsonb_agg(
        jsonb_build_object('cycle', all_cw.cycle, 'week', all_cw.week_in_cycle) 
        ORDER BY all_cw.cycle DESC, all_cw.week_in_cycle DESC
      ) AS cycle_weeks,
      'onboarding'::text AS source,
      (ow.week_start_date = v_current_monday) AS is_current_week
    FROM onboarding_weeks_all_cycles ow
    JOIN onboarding_weeks_all_cycles all_cw ON all_cw.week_start_date = ow.week_start_date
    WHERE ow.rn = 1  -- Only the most recent cycle-week
    GROUP BY ow.week_start_date, ow.total_moves, ow.conf_moves, ow.perf_moves
  ),
  ongoing_weeks AS (
    SELECT 
      wp.week_start_date AS week_of,
      COUNT(DISTINCT wp.id) AS total,
      COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN wp.id END) AS conf_count,
      COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN wp.id END) AS perf_count,
      jsonb_build_array(jsonb_build_object('cycle', NULL, 'week', NULL)) AS cycle_weeks,
      'ongoing'::text AS source,
      (wp.week_start_date = v_current_monday) AS is_current_week
    FROM weekly_plan wp
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = ('plan:' || wp.id::text) AND ws.staff_id = p_staff_id
    WHERE wp.role_id = p_role_id
    GROUP BY wp.week_start_date
  )
  SELECT * FROM onboarding_weeks
  UNION ALL
  SELECT * FROM ongoing_weeks
  ORDER BY week_of DESC;
END;
$$;
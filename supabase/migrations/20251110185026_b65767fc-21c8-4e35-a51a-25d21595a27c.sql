-- Fix get_calendar_week_status to use ISO weeks (Monday-based) and include current week
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
  cycle INT,
  week_in_cycle INT,
  source TEXT,
  is_current_week BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_location_id UUID;
  v_program_start DATE;
  v_cycle_length INT;
  v_tz TEXT;
  v_program_monday DATE;
  v_current_monday DATE;
  v_weeks_to_generate INT;
BEGIN
  -- Get user's primary location and program configuration
  SELECT s.primary_location_id, l.program_start_date::DATE, l.cycle_length_weeks, l.timezone
  INTO v_location_id, v_program_start, v_cycle_length, v_tz
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF v_location_id IS NULL OR v_program_start IS NULL THEN
    RETURN;
  END IF;

  IF v_tz IS NULL THEN
    v_tz := 'America/Chicago';
  END IF;

  -- Normalize program_start to the Monday of that week (ISO: Monday = 1)
  v_program_monday := v_program_start - ((EXTRACT(ISODOW FROM v_program_start)::INT - 1) || ' days')::INTERVAL;

  -- Compute current Monday in the location's timezone (ISO week)
  v_current_monday := (NOW() AT TIME ZONE v_tz)::DATE - ((EXTRACT(ISODOW FROM (NOW() AT TIME ZONE v_tz)::DATE)::INT - 1) || ' days')::INTERVAL;

  -- Calculate how many weeks to generate (from program start Monday to current Monday, inclusive)
  v_weeks_to_generate := ((v_current_monday - v_program_monday) / 7)::INT;

  RETURN QUERY
  WITH calendar_weeks AS (
    -- Generate all calendar weeks from program start Monday to current Monday
    SELECT 
      (v_program_monday + (n * 7))::DATE AS week_monday,
      n AS week_offset
    FROM generate_series(0, v_weeks_to_generate) AS n
  ),
  week_mappings AS (
    -- Map each calendar week to its cycle/week_in_cycle
    SELECT
      week_monday,
      ((week_offset / v_cycle_length) + 1) AS cycle,
      ((week_offset % v_cycle_length) + 1) AS week_in_cycle,
      week_offset,
      CASE 
        WHEN week_offset < 18 THEN 'onboarding'
        ELSE 'ongoing'
      END AS source
    FROM calendar_weeks
  ),
  onboarding_data AS (
    -- Get assignments and scores for onboarding weeks (weeks 1-18)
    SELECT
      wm.week_monday AS week_of,
      COUNT(DISTINCT wf.id) AS total,
      COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN wf.id END) AS conf_count,
      COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN wf.id END) AS perf_count,
      wm.cycle,
      wm.week_in_cycle,
      'onboarding'::TEXT AS source,
      (wm.week_monday = v_current_monday) AS is_current_week
    FROM week_mappings wm
    LEFT JOIN weekly_focus wf 
      ON wf.role_id = p_role_id 
      AND wf.cycle = wm.cycle 
      AND wf.week_in_cycle = wm.week_in_cycle
    LEFT JOIN weekly_scores ws 
      ON ws.weekly_focus_id = wf.id::TEXT 
      AND ws.staff_id = p_staff_id
    WHERE wm.source = 'onboarding'
    GROUP BY wm.week_monday, wm.cycle, wm.week_in_cycle
  ),
  ongoing_data AS (
    -- Get assignments and scores for ongoing weeks (week 19+)
    SELECT
      wm.week_monday AS week_of,
      COUNT(DISTINCT wp.id) AS total,
      COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN wp.id END) AS conf_count,
      COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN wp.id END) AS perf_count,
      NULL::INT AS cycle,
      NULL::INT AS week_in_cycle,
      'ongoing'::TEXT AS source,
      (wm.week_monday = v_current_monday) AS is_current_week
    FROM week_mappings wm
    LEFT JOIN weekly_plan wp 
      ON wp.week_start_date = wm.week_monday 
      AND wp.role_id = p_role_id
    LEFT JOIN weekly_scores ws 
      ON ws.weekly_focus_id = ('plan:' || wp.id::TEXT)
      AND ws.staff_id = p_staff_id
    WHERE wm.source = 'ongoing'
    GROUP BY wm.week_monday
  )
  SELECT * FROM onboarding_data
  UNION ALL
  SELECT * FROM ongoing_data
  ORDER BY week_of DESC;
END;
$$;
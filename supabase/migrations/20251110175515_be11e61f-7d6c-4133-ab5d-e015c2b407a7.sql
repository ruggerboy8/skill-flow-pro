-- Fix column order in get_calendar_week_status
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
  WITH onboarding_weeks AS (
    SELECT DISTINCT
      wf.week_start_date AS week_of,
      COUNT(*) AS total,
      COUNT(ws.confidence_score) AS conf_count,
      COUNT(ws.performance_score) AS perf_count,
      wf.cycle,
      wf.week_in_cycle,
      'onboarding'::text AS source,
      (wf.week_start_date = v_current_monday) AS is_current_week
    FROM weekly_focus wf
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.role_id = p_role_id AND wf.week_start_date IS NOT NULL
    GROUP BY wf.week_start_date, wf.cycle, wf.week_in_cycle
  ),
  ongoing_weeks AS (
    SELECT DISTINCT
      wp.week_start_date AS week_of,
      COUNT(*) AS total,
      COUNT(ws.confidence_score) AS conf_count,
      COUNT(ws.performance_score) AS perf_count,
      NULL::int AS cycle,
      NULL::int AS week_in_cycle,
      'ongoing'::text AS source,
      (wp.week_start_date = v_current_monday) AS is_current_week
    FROM weekly_plan wp
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wp.id::text AND ws.staff_id = p_staff_id
    WHERE wp.role_id = p_role_id
    GROUP BY wp.week_start_date
  )
  SELECT * FROM onboarding_weeks
  UNION ALL
  SELECT * FROM ongoing_weeks
  ORDER BY week_of DESC;
END;
$$;
-- Fix get_calendar_week_status to only filter when participation_start_at is explicitly set
CREATE OR REPLACE FUNCTION public.get_calendar_week_status(p_staff_id uuid, p_role_id bigint)
RETURNS TABLE(
  cycle integer,
  week_in_cycle integer,
  week_of date,
  total integer,
  conf_count integer,
  perf_count integer,
  is_current_week boolean,
  source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_location_id uuid;
  v_program_start date;
  v_cycle_length int;
  v_participation_start timestamptz;
  v_tz text;
  v_has_explicit_start boolean;
BEGIN
  -- Get staff's location info and participation start
  SELECT 
    s.primary_location_id,
    s.participation_start_at,
    l.program_start_date::date,
    l.cycle_length_weeks,
    l.timezone,
    (s.participation_start_at IS NOT NULL) as has_explicit_start
  INTO v_location_id, v_participation_start, v_program_start, v_cycle_length, v_tz, v_has_explicit_start
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Staff member has no primary location';
  END IF;

  RETURN QUERY
  WITH all_weeks AS (
    SELECT DISTINCT
      wf.cycle,
      wf.week_in_cycle,
      -- Calculate week_of from cycle/week_in_cycle
      (v_program_start + ((wf.cycle - 1) * v_cycle_length + (wf.week_in_cycle - 1)) * 7)::date as week_of
    FROM weekly_focus wf
    WHERE wf.role_id = p_role_id
    
    UNION
    
    SELECT DISTINCT
      -- Calculate cycle/week from week_start_date
      CASE 
        WHEN ((wp.week_start_date - v_program_start) / 7) = 0 THEN 1
        ELSE (((wp.week_start_date - v_program_start) / 7) / v_cycle_length) + 1
      END as cycle,
      CASE
        WHEN ((wp.week_start_date - v_program_start) / 7) = 0 THEN 1
        ELSE (((wp.week_start_date - v_program_start) / 7) % v_cycle_length) + 1
      END as week_in_cycle,
      wp.week_start_date as week_of
    FROM weekly_plan wp
    WHERE wp.role_id = p_role_id::int
      AND wp.status = 'locked'
  ),
  current_week_calc AS (
    SELECT date_trunc('week', (now() AT TIME ZONE v_tz))::date as current_monday
  )
  SELECT 
    aw.cycle,
    aw.week_in_cycle,
    aw.week_of,
    COUNT(ws.id)::integer as total,
    COUNT(ws.confidence_score)::integer as conf_count,
    COUNT(ws.performance_score)::integer as perf_count,
    (aw.week_of = cwc.current_monday) as is_current_week,
    CASE 
      WHEN aw.cycle <= 3 THEN 'focus'
      ELSE 'plan'
    END as source
  FROM all_weeks aw
  CROSS JOIN current_week_calc cwc
  LEFT JOIN weekly_scores ws ON ws.staff_id = p_staff_id 
    AND ws.week_of = aw.week_of
  WHERE 
    -- Only filter by participation_start if it's explicitly set
    CASE 
      WHEN v_has_explicit_start THEN aw.week_of >= date_trunc('week', v_participation_start)::date
      ELSE true
    END
  GROUP BY aw.cycle, aw.week_in_cycle, aw.week_of, cwc.current_monday
  ORDER BY aw.week_of DESC;
END;
$function$;
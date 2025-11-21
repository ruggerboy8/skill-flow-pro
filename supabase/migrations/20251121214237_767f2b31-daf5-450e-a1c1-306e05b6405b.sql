
-- ============================================
-- Fix RPCs to query weekly_assignments instead of weekly_focus
-- ============================================

-- 1. Fix get_calibration RPC
CREATE OR REPLACE FUNCTION public.get_calibration(
  p_staff_id uuid,
  p_role_id bigint,
  p_window integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calibration_data jsonb := '[]'::jsonb;
  domain_record record;
  mean_conf numeric;
  mean_perf numeric;
  mean_delta numeric;
  label_val text;
  data_count int;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  -- Get staff location and org for assignment matching
  SELECT s.primary_location_id, l.organization_id
  INTO location_id_val, org_id_val
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  FOR domain_record IN 
    SELECT DISTINCT d.domain_name
    FROM domains d
    JOIN competencies c ON c.domain_id = d.domain_id
    JOIN pro_moves pm ON pm.competency_id = c.competency_id
    WHERE pm.role_id = p_role_id
    ORDER BY d.domain_name
  LOOP
    -- Use weekly_assignments instead of weekly_focus
    SELECT 
      AVG(ws.confidence_score)::numeric,
      AVG(ws.performance_score)::numeric,
      COUNT(*)
    INTO mean_conf, mean_perf, data_count
    FROM weekly_assignments wa
    JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text)
    JOIN pro_moves pm ON pm.action_id = wa.action_id
    JOIN competencies c ON c.competency_id = pm.competency_id
    JOIN domains d ON d.domain_id = c.domain_id
    WHERE ws.staff_id = p_staff_id
      AND wa.role_id = p_role_id
      AND d.domain_name = domain_record.domain_name
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND wa.status = 'locked'
      AND (
        wa.location_id = location_id_val
        OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );
    
    IF data_count >= 2 THEN
      mean_delta := mean_perf - mean_conf;
      
      IF mean_delta >= 0.5 THEN
        label_val := 'under-confident';
      ELSIF mean_delta <= -0.5 THEN
        label_val := 'over-confident';
      ELSE
        label_val := 'well-calibrated';
      END IF;
    ELSE
      mean_delta := NULL;
      label_val := 'Not enough data';
    END IF;
    
    calibration_data := calibration_data || jsonb_build_object(
      'domain_name', domain_record.domain_name,
      'mean_conf', CASE WHEN mean_conf IS NOT NULL THEN ROUND(mean_conf, 2) ELSE NULL END,
      'mean_perf', CASE WHEN mean_perf IS NOT NULL THEN ROUND(mean_perf, 2) ELSE NULL END,
      'mean_delta', CASE WHEN mean_delta IS NOT NULL THEN ROUND(mean_delta, 2) ELSE NULL END,
      'label', label_val
    );
  END LOOP;
  
  RETURN calibration_data;
END;
$function$;

-- 2. Fix get_performance_trend RPC
CREATE OR REPLACE FUNCTION public.get_performance_trend(
  p_staff_id uuid,
  p_role_id bigint,
  p_window integer DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  domain_trends jsonb := '[]'::jsonb;
  domain_record record;
  week_record record;
  points_array jsonb;
  slope_val numeric;
  label_val text;
  x_vals numeric[];
  y_vals numeric[];
  n int;
  sum_x numeric;
  sum_y numeric;
  sum_xy numeric;
  sum_x2 numeric;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  -- Get staff location and org for assignment matching
  SELECT s.primary_location_id, l.organization_id, l.program_start_date, l.cycle_length_weeks
  INTO location_id_val, org_id_val
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  FOR domain_record IN 
    SELECT DISTINCT d.domain_name
    FROM domains d
    JOIN competencies c ON c.domain_id = d.domain_id
    JOIN pro_moves pm ON pm.competency_id = c.competency_id
    WHERE pm.role_id = p_role_id
    ORDER BY d.domain_name
  LOOP
    points_array := '[]'::jsonb;
    x_vals := ARRAY[]::numeric[];
    y_vals := ARRAY[]::numeric[];
    
    -- Use weekly_assignments and compute cycle/week from week_start_date
    FOR week_record IN
      WITH week_calcs AS (
        SELECT 
          wa.week_start_date,
          AVG(ws.performance_score) as avg_score,
          -- Compute cycle and week_in_cycle from week_start_date
          CASE 
            WHEN ((wa.week_start_date - l.program_start_date) / 7) = 0 THEN 1
            ELSE (((wa.week_start_date - l.program_start_date) / 7) / l.cycle_length_weeks) + 1
          END as cycle,
          CASE
            WHEN ((wa.week_start_date - l.program_start_date) / 7) = 0 THEN 1
            ELSE (((wa.week_start_date - l.program_start_date) / 7) % l.cycle_length_weeks) + 1
          END as week_in_cycle
        FROM weekly_assignments wa
        JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text)
        JOIN pro_moves pm ON pm.action_id = wa.action_id
        JOIN competencies c ON c.competency_id = pm.competency_id
        JOIN domains d ON d.domain_id = c.domain_id
        LEFT JOIN locations l ON l.id = location_id_val
        WHERE ws.staff_id = p_staff_id
          AND wa.role_id = p_role_id
          AND d.domain_name = domain_record.domain_name
          AND ws.performance_score IS NOT NULL
          AND wa.status = 'locked'
          AND (
            wa.location_id = location_id_val
            OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
            OR (wa.org_id IS NULL AND wa.location_id IS NULL)
          )
        GROUP BY wa.week_start_date, l.program_start_date, l.cycle_length_weeks
      )
      SELECT 
        cycle,
        week_in_cycle,
        avg_score,
        cycle || '-' || week_in_cycle as week_key,
        week_start_date
      FROM week_calcs
      ORDER BY week_start_date DESC
      LIMIT p_window
    LOOP
      points_array := jsonb_build_object(
        'week_key', week_record.week_key,
        'value', ROUND(week_record.avg_score::numeric, 2)
      ) || points_array;
      
      x_vals := array_append(x_vals, array_length(x_vals, 1) + 1);
      y_vals := array_append(y_vals, week_record.avg_score);
    END LOOP;
    
    n := array_length(x_vals, 1);
    IF n >= 3 THEN
      sum_x := (SELECT SUM(unnest) FROM unnest(x_vals));
      sum_y := (SELECT SUM(unnest) FROM unnest(y_vals));
      sum_xy := (SELECT SUM(x * y) FROM unnest(x_vals) WITH ORDINALITY AS t1(x, i) JOIN unnest(y_vals) WITH ORDINALITY AS t2(y, j) ON i = j);
      sum_x2 := (SELECT SUM(x * x) FROM unnest(x_vals) AS x);
      
      slope_val := (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
      
      IF slope_val >= 0.25 THEN
        label_val := 'Improving';
      ELSIF slope_val <= -0.25 THEN
        label_val := 'Declining';  
      ELSE
        label_val := 'Holding steady';
      END IF;
    ELSE
      slope_val := 0;
      label_val := 'Not enough data';
    END IF;
    
    domain_trends := domain_trends || jsonb_build_object(
      'domain_name', domain_record.domain_name,
      'points', points_array,
      'slope', ROUND(slope_val, 3),
      'label', label_val
    );
  END LOOP;
  
  RETURN domain_trends;
END;
$function$;

-- 3. Fix get_consistency RPC
CREATE OR REPLACE FUNCTION public.get_consistency(
  p_staff_id uuid,
  p_weeks integer DEFAULT 6,
  p_tz text DEFAULT 'America/Chicago'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  staff_record record;
  week_record record;
  result jsonb;
  on_time_count int := 0;
  late_count int := 0;
  streak int := 0;
  weeks_array jsonb := '[]'::jsonb;
  current_date_calc date;
  week_start date;
  conf_status text;
  perf_status text;
  week_data jsonb;
  location_id_val uuid;
  org_id_val uuid;
BEGIN
  SELECT s.*, l.timezone, l.program_start_date, l.cycle_length_weeks, s.primary_location_id, l.organization_id
  INTO staff_record
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'on_time_count', 0,
      'late_count', 0,
      'streak', 0,
      'weeks', '[]'::jsonb
    );
  END IF;
  
  location_id_val := staff_record.primary_location_id;
  org_id_val := staff_record.organization_id;
  current_date_calc := (now() AT TIME ZONE COALESCE(p_tz, staff_record.timezone, 'America/Chicago'))::date;
  
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    week_start := current_date_calc - ((EXTRACT(DOW FROM current_date_calc)::int + 6) % 7) - (i * 7);
    
    SELECT 
      ((week_start - staff_record.program_start_date)::int / 7 / staff_record.cycle_length_weeks) + 1 as cycle,
      (((week_start - staff_record.program_start_date)::int / 7) % staff_record.cycle_length_weeks) + 1 as week_in_cycle
    INTO week_record;
    
    conf_status := 'missing';
    perf_status := 'missing';
    
    -- Use weekly_assignments instead of weekly_focus
    SELECT 
      CASE 
        WHEN COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL) = 0 THEN 'missing'
        WHEN COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL AND ws.confidence_date <= (week_start + INTERVAL '1 day' + INTERVAL '12 hours')) = COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL) THEN 'on_time'
        ELSE 'late'
      END as conf_st,
      CASE 
        WHEN COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL) = 0 THEN 'missing'
        WHEN COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL AND ws.performance_date <= (week_start + INTERVAL '4 days' + INTERVAL '17 hours')) = COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL) THEN 'on_time'
        ELSE 'late'
      END as perf_st
    INTO conf_status, perf_status
    FROM weekly_assignments wa
    LEFT JOIN weekly_scores ws ON ws.assignment_id = ('assign:' || wa.id::text) AND ws.staff_id = p_staff_id
    WHERE wa.week_start_date = week_start
      AND wa.role_id = staff_record.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = location_id_val
        OR (wa.location_id IS NULL AND wa.org_id = org_id_val)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );
    
    week_data := jsonb_build_object(
      'cycle', week_record.cycle,
      'week_in_cycle', week_record.week_in_cycle,
      'conf_status', conf_status,
      'perf_status', perf_status,
      'conf_ts', null,
      'perf_ts', null
    );
    
    weeks_array := weeks_array || week_data;
    
    IF conf_status = 'on_time' AND perf_status = 'on_time' THEN
      on_time_count := on_time_count + 1;
    ELSIF (conf_status = 'late' OR perf_status = 'late') AND conf_status != 'missing' AND perf_status != 'missing' THEN
      late_count := late_count + 1;
    END IF;
  END LOOP;
  
  FOR i IN REVERSE (jsonb_array_length(weeks_array) - 1)..0 LOOP
    week_data := weeks_array->i;
    IF (week_data->>'conf_status') = 'on_time' AND (week_data->>'perf_status') = 'on_time' THEN
      streak := streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'on_time_count', on_time_count,
    'late_count', late_count,
    'streak', streak,
    'weeks', weeks_array
  );
END;
$function$;

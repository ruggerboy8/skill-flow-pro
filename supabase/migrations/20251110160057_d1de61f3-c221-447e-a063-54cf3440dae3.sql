
-- Fix type casting in stats RPC functions for weekly_focus_id comparisons

-- RPC: Get consistency data for a staff member over a time window
CREATE OR REPLACE FUNCTION public.get_consistency(
  p_staff_id uuid,
  p_weeks int DEFAULT 6,
  p_tz text DEFAULT 'America/Chicago'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  SELECT s.*, l.timezone, l.program_start_date, l.cycle_length_weeks
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
  
  current_date_calc := (now() AT TIME ZONE COALESCE(p_tz, staff_record.timezone, 'America/Chicago'))::date;
  
  FOR i IN REVERSE (p_weeks - 1)..0 LOOP
    week_start := current_date_calc - ((EXTRACT(DOW FROM current_date_calc)::int + 6) % 7) - (i * 7);
    
    SELECT 
      ((week_start - staff_record.program_start_date)::int / 7 / staff_record.cycle_length_weeks) + 1 as cycle,
      (((week_start - staff_record.program_start_date)::int / 7) % staff_record.cycle_length_weeks) + 1 as week_in_cycle
    INTO week_record;
    
    conf_status := 'missing';
    perf_status := 'missing';
    
    -- FIXED: Cast wf.id to text for comparison
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
    FROM weekly_focus wf
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.cycle = week_record.cycle 
      AND wf.week_in_cycle = week_record.week_in_cycle
      AND wf.role_id = staff_record.role_id;
    
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
$$;

-- RPC: Get performance trend by domain for a staff member
CREATE OR REPLACE FUNCTION public.get_performance_trend(
  p_staff_id uuid,
  p_role_id bigint,
  p_window int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
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
    
    -- FIXED: Cast wf.id to text for comparison
    FOR week_record IN
      SELECT DISTINCT 
        wf.cycle,
        wf.week_in_cycle,
        AVG(ws.performance_score) as avg_score,
        wf.cycle || '-' || wf.week_in_cycle as week_key
      FROM weekly_focus wf
      JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text
      JOIN pro_moves pm ON pm.action_id = wf.action_id
      JOIN competencies c ON c.competency_id = pm.competency_id
      JOIN domains d ON d.domain_id = c.domain_id
      WHERE ws.staff_id = p_staff_id
        AND wf.role_id = p_role_id
        AND d.domain_name = domain_record.domain_name
        AND ws.performance_score IS NOT NULL
      GROUP BY wf.cycle, wf.week_in_cycle
      ORDER BY wf.cycle DESC, wf.week_in_cycle DESC
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
$$;

-- RPC: Get calibration data by domain for a staff member  
CREATE OR REPLACE FUNCTION public.get_calibration(
  p_staff_id uuid,
  p_role_id bigint,
  p_window int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  calibration_data jsonb := '[]'::jsonb;
  domain_record record;
  mean_conf numeric;
  mean_perf numeric;
  mean_delta numeric;
  label_val text;
  data_count int;
BEGIN
  FOR domain_record IN 
    SELECT DISTINCT d.domain_name
    FROM domains d
    JOIN competencies c ON c.domain_id = d.domain_id
    JOIN pro_moves pm ON pm.competency_id = c.competency_id
    WHERE pm.role_id = p_role_id
    ORDER BY d.domain_name
  LOOP
    -- FIXED: Cast wf.id to text for comparison
    SELECT 
      AVG(ws.confidence_score)::numeric,
      AVG(ws.performance_score)::numeric,
      COUNT(*)
    INTO mean_conf, mean_perf, data_count
    FROM weekly_focus wf
    JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text
    JOIN pro_moves pm ON pm.action_id = wf.action_id
    JOIN competencies c ON c.competency_id = pm.competency_id
    JOIN domains d ON d.domain_id = c.domain_id
    WHERE ws.staff_id = p_staff_id
      AND wf.role_id = p_role_id
      AND d.domain_name = domain_record.domain_name
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND wf.cycle >= (SELECT MAX(cycle) - 1 FROM weekly_focus WHERE role_id = p_role_id);
    
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
$$;

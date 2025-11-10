-- Backfill weekly_scores for johno@reallygoodconsulting.org (Cycles 1-3)
-- Fixed: includes entered_by field

DO $$
DECLARE
  v_staff_id uuid := '0df48cba-1e22-4588-8685-72da2566f2e5';
  v_user_id uuid := 'f4bf43b4-6038-4e7a-856e-d6fe7e1d8022';
  v_role_id bigint := 2;
  v_tz text := 'America/Chicago';
  v_program_start date := '2025-07-01';
  v_focus_record record;
  v_conf_score int;
  v_perf_score int;
  v_conf_ts timestamptz;
  v_perf_ts timestamptz;
  v_week_start date;
  v_week_end date;
BEGIN
  FOR v_focus_record IN
    SELECT id, cycle, week_in_cycle
    FROM weekly_focus
    WHERE role_id = v_role_id AND cycle IN (1, 2, 3)
    ORDER BY cycle, week_in_cycle, display_order
  LOOP
    v_week_start := v_program_start + ((v_focus_record.cycle - 1) * 6 + (v_focus_record.week_in_cycle - 1)) * 7;
    v_week_end := v_week_start + 6;
    
    v_conf_score := 2 + (RANDOM() * 2)::int;
    v_perf_score := CASE
      WHEN RANDOM() < 0.7 THEN v_conf_score
      WHEN RANDOM() < 0.5 THEN GREATEST(1, v_conf_score - 1)
      ELSE LEAST(4, v_conf_score + 1)
    END;
    
    v_conf_ts := (v_week_start + (RANDOM() * 6)::int)::timestamp AT TIME ZONE v_tz 
                 + (INTERVAL '8 hours') + (RANDOM() * INTERVAL '10 hours');
    v_perf_ts := (v_week_end + (RANDOM())::int)::timestamp AT TIME ZONE v_tz
                 + (INTERVAL '10 hours') + (RANDOM() * INTERVAL '8 hours');
    
    INSERT INTO weekly_scores (
      staff_id,
      weekly_focus_id,
      confidence_score,
      confidence_date,
      performance_score,
      performance_date,
      entered_by,
      created_at,
      updated_at
    ) VALUES (
      v_staff_id,
      v_focus_record.id::text,
      v_conf_score,
      v_conf_ts,
      v_perf_score,
      v_perf_ts,
      v_user_id,
      v_perf_ts,
      v_perf_ts
    )
    ON CONFLICT (staff_id, weekly_focus_id) DO UPDATE SET
      confidence_score = EXCLUDED.confidence_score,
      confidence_date = EXCLUDED.confidence_date,
      performance_score = EXCLUDED.performance_score,
      performance_date = EXCLUDED.performance_date,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END $$;
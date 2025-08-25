-- RPC to backfill historical timestamps for weekly_scores
CREATE OR REPLACE FUNCTION public.backfill_historical_score_timestamps(
  p_staff_id uuid,
  p_only_backfill boolean DEFAULT true,      -- only touch rows saved via the backfill wizard
  p_jitter_minutes int DEFAULT 45            -- ± jitter so times aren't identical
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tz text;
  start_date date;
  cycle_len int;
  r record;
  week_index int;
  mon date;
  conf_local timestamp;   -- local, naive
  perf_local timestamp;   -- local, naive
  conf_ts timestamptz;    -- tz-aware
  perf_ts timestamptz;    -- tz-aware
  updated_count int := 0;
  jitter int;
  monday0 date;
  isodow int;
BEGIN
  -- Pull timezone and cadence from the staff's primary location
  SELECT l.timezone, l.program_start_date::date, l.cycle_length_weeks
    INTO tz, start_date, cycle_len
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF tz IS NULL THEN
    RAISE EXCEPTION 'No timezone/program start for staff %', p_staff_id;
  END IF;

  -- Normalize the program start to Monday (ISO: 1=Mon..7=Sun), so week math is stable
  isodow := extract(isodow from start_date);
  monday0 := start_date - ((isodow - 1))::int;

  FOR r IN
    SELECT ws.id, ws.confidence_score, ws.performance_score,
           ws.confidence_source, ws.performance_source,
           wf.cycle, wf.week_in_cycle
    FROM weekly_scores ws
    JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
    WHERE ws.staff_id = p_staff_id
      AND ws.confidence_score IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND (
        p_only_backfill IS FALSE
        OR (COALESCE(ws.confidence_source::text,'') = 'backfill'
            AND COALESCE(ws.performance_source::text,'') = 'backfill')
      )
  LOOP
    -- map cycle/week to an absolute week index since program start
    week_index := (r.cycle - 1) * cycle_len + (r.week_in_cycle - 1);

    -- the Monday (local-date) for that absolute week
    mon := monday0 + (week_index * 7);

    -- deterministic small jitter so rows don't share identical minute/second
    jitter := CASE WHEN p_jitter_minutes > 0
              THEN ((abs(hashtext(r.id::text)) % (2*p_jitter_minutes + 1)) - p_jitter_minutes)
              ELSE 0 END;

    -- local naive timestamps for "on-time" submission windows
    conf_local := (mon + time '10:00') + make_interval(mins => jitter);      -- Mon 10:00 local
    perf_local := (mon + 3 + time '16:00') + make_interval(mins => jitter);  -- Thu 16:00 local

    -- treat local times as happening in tz, convert to timestamptz
    conf_ts := conf_local AT TIME ZONE tz;
    perf_ts := perf_local AT TIME ZONE tz;

    UPDATE weekly_scores
       SET confidence_date   = conf_ts,
           performance_date  = perf_ts,
           confidence_late   = false,
           performance_late  = false,
           confidence_source = CASE WHEN confidence_source = 'backfill' THEN 'backfill_historical' ELSE confidence_source END,
           performance_source= CASE WHEN performance_source = 'backfill' THEN 'backfill_historical' ELSE performance_source END
     WHERE id = r.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;
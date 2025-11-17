
-- 1) Fix all week_of values to be correct based on confidence_date/performance_date
UPDATE weekly_scores ws
SET week_of = sub.correct_monday
FROM (
  SELECT
    ws.id,
    (timezone(l.timezone, COALESCE(ws.confidence_date, ws.performance_date, ws.created_at))::date
     - ((EXTRACT(dow FROM timezone(l.timezone, COALESCE(ws.confidence_date, ws.performance_date, ws.created_at)))::int + 6) % 7))::date as correct_monday
  FROM weekly_scores ws
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
) sub
WHERE ws.id = sub.id
  AND ws.week_of != sub.correct_monday;

-- 2) Remove duplicate trigger (there are 2 triggers doing the same thing)
DROP TRIGGER IF EXISTS set_week_of_trigger ON weekly_scores;

-- 3) Update the trigger to ALWAYS recalculate week_of (don't trust client input)
CREATE OR REPLACE FUNCTION set_week_of() RETURNS TRIGGER AS $$
DECLARE
  tz text;
  anchor timestamptz;
  local_ts timestamptz;
  monday date;
BEGIN
  -- Lookup timezone via staff -> location
  SELECT l.timezone INTO tz
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = COALESCE(NEW.staff_id, OLD.staff_id);

  IF tz IS NULL THEN
    RAISE WARNING 'No timezone found for staff %, cannot set week_of', COALESCE(NEW.staff_id, OLD.staff_id);
    RETURN NEW;
  END IF;

  -- Choose the best available timestamp
  anchor := COALESCE(NEW.confidence_date, NEW.performance_date, NEW.created_at, now());

  -- Convert to local time and compute local Monday
  local_ts := timezone(tz, anchor);
  monday := (local_ts::date - ((EXTRACT(dow FROM local_ts)::int + 6) % 7))::date;

  -- ALWAYS set week_of to the computed value (don't trust client)
  NEW.week_of := monday;
  RETURN NEW;
END
$$ LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp';
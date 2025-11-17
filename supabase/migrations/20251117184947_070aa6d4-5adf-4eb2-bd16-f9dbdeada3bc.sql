-- Trigger to set week_of based on staff location timezone
CREATE OR REPLACE FUNCTION set_week_of() RETURNS trigger AS $$
DECLARE
  tz text;
  anchor timestamptz;
  local_ts timestamptz;
  monday date;
BEGIN
  -- lookup timezone via staff -> location
  SELECT l.timezone
    INTO tz
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = COALESCE(NEW.staff_id, OLD.staff_id);

  -- choose the best available timestamp
  anchor := COALESCE(NEW.confidence_date, NEW.performance_date, NEW.created_at, now());

  -- convert to local time and compute local Monday
  local_ts := timezone(tz, anchor);
  monday := (local_ts::date - ((EXTRACT(dow FROM local_ts)::int + 6) % 7))::date;

  -- only set if not provided by app
  NEW.week_of := COALESCE(NEW.week_of, monday);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS set_week_of_trigger ON weekly_scores;
CREATE TRIGGER set_week_of_trigger
  BEFORE INSERT OR UPDATE ON weekly_scores
  FOR EACH ROW
  EXECUTE FUNCTION set_week_of();

-- Backfill historical rows with week_of
UPDATE weekly_scores ws
SET week_of = sub.monday
FROM (
  SELECT
    ws.id,
    (
      timezone(l.timezone, COALESCE(ws.confidence_date, ws.performance_date, ws.created_at))::date
      - ((EXTRACT(dow FROM timezone(l.timezone, COALESCE(ws.confidence_date, ws.performance_date, ws.created_at)))::int + 6) % 7)
    )::date AS monday
  FROM weekly_scores ws
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE ws.week_of IS NULL
) sub
WHERE ws.id = sub.id;
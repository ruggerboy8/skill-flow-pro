-- Fix search_path security warning for set_week_of function
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
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
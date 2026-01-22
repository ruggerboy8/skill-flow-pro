-- Fix the set_week_of trigger to respect explicitly provided week_of values
-- This is needed for backfill submissions where week_of is explicitly set
CREATE OR REPLACE FUNCTION public.set_week_of()
RETURNS TRIGGER AS $$
DECLARE
  tz text;
  anchor timestamptz;
  local_ts timestamp;
  monday date;
BEGIN
  -- Get the staff's timezone (fallback to UTC)
  SELECT COALESCE(l.timezone, 'UTC') INTO tz
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = NEW.staff_id;

  IF tz IS NULL THEN
    tz := 'UTC';
  END IF;

  -- Choose the best available timestamp
  anchor := COALESCE(NEW.confidence_date, NEW.performance_date, NEW.created_at, now());

  -- Convert to local time and compute local Monday
  local_ts := timezone(tz, anchor);
  monday := (local_ts::date - ((EXTRACT(dow FROM local_ts)::int + 6) % 7))::date;

  -- Use explicit week_of if provided, otherwise compute from timestamp
  -- This allows backfill submissions to set their own week_of
  NEW.week_of := COALESCE(NEW.week_of, monday);
  RETURN NEW;
END
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
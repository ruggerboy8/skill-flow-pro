-- Fix timestamp formatting in view_staff_submission_windows
-- The issue was invalid concatenation of date with time strings

-- Drop dependent function first
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid);

-- Drop the view
DROP VIEW IF EXISTS view_staff_submission_windows;

-- Recreate view with corrected timestamp formatting
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH submission_matrix AS (
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    l.id AS location_id,
    ws.week_of,
    ws.weekly_focus_id,
    -- Calculate participation start (Monday on or after hire date)
    CASE
      WHEN EXTRACT(DOW FROM s.hire_date) = 1 THEN s.hire_date
      ELSE s.hire_date + ((8 - EXTRACT(DOW FROM s.hire_date)::integer) % 7)
    END AS participation_start_monday,
    l.program_start_date AS location_program_start,
    -- Calculate weeks since participation start
    ((ws.week_of - (
      CASE
        WHEN EXTRACT(DOW FROM s.hire_date) = 1 THEN s.hire_date
        ELSE s.hire_date + ((8 - EXTRACT(DOW FROM s.hire_date)::integer) % 7)
      END
    )) / 7)::integer AS weeks_since_start,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late
  FROM staff s
  CROSS JOIN LATERAL (
    SELECT DISTINCT week_start_date AS week_of, id::text AS weekly_focus_id
    FROM weekly_focus
    WHERE role_id = s.role_id
    UNION
    SELECT DISTINCT week_start_date AS week_of, ('plan:' || id::text) AS weekly_focus_id
    FROM weekly_plan
    WHERE role_id = s.role_id AND status = 'locked'
  ) wf
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN weekly_scores ws ON ws.staff_id = s.id 
    AND ws.week_of = wf.week_of
  WHERE s.is_participant = true
    AND s.role_id IS NOT NULL
    AND l.id IS NOT NULL
),
expanded AS (
  SELECT
    sm.*,
    unnest(ARRAY[1, 2, 3]) AS slot_index
  FROM submission_matrix sm
)
SELECT
  e.staff_id,
  e.staff_name,
  e.role_id,
  e.location_id,
  e.week_of,
  -- Cycle and week calculation
  CASE 
    WHEN e.weeks_since_start = 0 THEN 1
    ELSE (e.weeks_since_start / 6)::int + 1
  END AS cycle_number,
  CASE 
    WHEN e.weeks_since_start = 0 THEN 1
    ELSE (e.weeks_since_start % 6)::int + 1
  END AS week_in_cycle,
  e.slot_index,
  NULL::bigint AS action_id,
  -- Determine if required based on participation start and location program start
  (e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start)) AS required,
  -- Confidence metrics (slot 1-3, due end of Monday)
  CASE 
    WHEN e.slot_index <= 3 THEN 'confidence'
    ELSE NULL
  END AS metric,
  CASE 
    WHEN e.slot_index <= 3 THEN (e.week_of::date + INTERVAL '1 day - 1 second')::timestamp
    ELSE NULL
  END AS due_at,
  CASE 
    WHEN e.slot_index <= 3 THEN e.confidence_date
    ELSE NULL
  END AS submitted_at,
  CASE 
    WHEN e.slot_index <= 3 THEN e.confidence_late
    ELSE NULL
  END AS submitted_late,
  CASE 
    WHEN e.slot_index <= 3 AND e.confidence_score IS NOT NULL THEN 
      NOT COALESCE(e.confidence_late, false)
    ELSE NULL
  END AS on_time,
  CASE
    WHEN e.slot_index <= 3 AND e.confidence_score IS NOT NULL THEN 'submitted'
    WHEN e.slot_index <= 3 AND e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start) 
      AND (e.week_of::date + INTERVAL '1 day - 1 second')::timestamp < NOW() THEN 'missing'
    WHEN e.slot_index <= 3 AND e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start) THEN 'pending'
    ELSE 'not_required'
  END AS status
FROM expanded e
WHERE e.slot_index <= 3

UNION ALL

SELECT
  e.staff_id,
  e.staff_name,
  e.role_id,
  e.location_id,
  e.week_of,
  -- Cycle and week calculation
  CASE 
    WHEN e.weeks_since_start = 0 THEN 1
    ELSE (e.weeks_since_start / 6)::int + 1
  END AS cycle_number,
  CASE 
    WHEN e.weeks_since_start = 0 THEN 1
    ELSE (e.weeks_since_start % 6)::int + 1
  END AS week_in_cycle,
  e.slot_index,
  NULL::bigint AS action_id,
  -- Determine if required based on participation start and location program start
  (e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start)) AS required,
  -- Performance metrics (slot 1-3, due end of Thursday)
  CASE 
    WHEN e.slot_index <= 3 THEN 'performance'
    ELSE NULL
  END AS metric,
  CASE 
    WHEN e.slot_index <= 3 THEN (e.week_of::date + INTERVAL '4 days - 1 second')::timestamp
    ELSE NULL
  END AS due_at,
  CASE 
    WHEN e.slot_index <= 3 THEN e.performance_date
    ELSE NULL
  END AS submitted_at,
  CASE 
    WHEN e.slot_index <= 3 THEN e.performance_late
    ELSE NULL
  END AS submitted_late,
  CASE 
    WHEN e.slot_index <= 3 AND e.performance_score IS NOT NULL THEN 
      NOT COALESCE(e.performance_late, false)
    ELSE NULL
  END AS on_time,
  CASE
    WHEN e.slot_index <= 3 AND e.performance_score IS NOT NULL THEN 'submitted'
    WHEN e.slot_index <= 3 AND e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start) 
      AND (e.week_of::date + INTERVAL '4 days - 1 second')::timestamp < NOW() THEN 'missing'
    WHEN e.slot_index <= 3 AND e.week_of >= GREATEST(e.participation_start_monday, e.location_program_start) THEN 'pending'
    ELSE 'not_required'
  END AS status
FROM expanded e
WHERE e.slot_index <= 3;

-- Recreate the function
CREATE OR REPLACE FUNCTION get_staff_submission_windows(p_staff_id uuid)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id bigint,
  location_id uuid,
  week_of date,
  cycle_number integer,
  week_in_cycle integer,
  slot_index integer,
  action_id bigint,
  required boolean,
  metric text,
  due_at timestamp,
  submitted_at timestamptz,
  submitted_late boolean,
  on_time boolean,
  status text
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    staff_id,
    staff_name,
    role_id,
    location_id,
    week_of,
    cycle_number,
    week_in_cycle,
    slot_index,
    action_id,
    required,
    metric,
    due_at,
    submitted_at,
    submitted_late,
    on_time,
    status
  FROM view_staff_submission_windows
  WHERE staff_id = p_staff_id
  ORDER BY week_of DESC, metric, slot_index;
$$;

-- Sanity check: verify the function returns data
DO $$
DECLARE
  row_count integer;
BEGIN
  SELECT COUNT(*) INTO row_count
  FROM get_staff_submission_windows('fa9cb463-0e0d-4f73-b9e4-04521ebabd2e');
  
  RAISE NOTICE 'Sanity check: get_staff_submission_windows returned % rows', row_count;
  
  IF row_count = 0 THEN
    RAISE WARNING 'No submission windows found for test staff ID';
  END IF;
END $$;
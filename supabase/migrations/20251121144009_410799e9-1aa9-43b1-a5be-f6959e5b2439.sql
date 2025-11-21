-- Drop and recreate get_calendar_week_status using view_staff_submission_windows
DROP FUNCTION IF EXISTS get_calendar_week_status(uuid, integer) CASCADE;

CREATE OR REPLACE FUNCTION get_calendar_week_status(
  p_location_id uuid,
  p_role_id int
)
RETURNS TABLE (
  week_of date,
  cycle_number int,
  week_in_cycle int,
  total_staff int,
  conf_complete_count int,
  perf_complete_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH staff_in_location AS (
    SELECT DISTINCT s.id as staff_id
    FROM staff s
    WHERE s.primary_location_id = p_location_id
      AND s.role_id = p_role_id
      AND s.is_participant = true
  ),
  all_windows AS (
    SELECT 
      v.week_of,
      v.cycle_number,
      v.week_in_cycle,
      v.staff_id,
      v.metric,
      v.status
    FROM view_staff_submission_windows v
    WHERE v.location_id = p_location_id
      AND v.role_id = p_role_id
      AND EXISTS (SELECT 1 FROM staff_in_location sil WHERE sil.staff_id = v.staff_id)
  ),
  week_staff_metrics AS (
    SELECT
      aw.week_of,
      aw.cycle_number,
      aw.week_in_cycle,
      aw.staff_id,
      bool_and(CASE WHEN aw.metric = 'confidence' THEN aw.status IN ('on_time', 'late') ELSE true END) as conf_complete,
      bool_and(CASE WHEN aw.metric = 'performance' THEN aw.status IN ('on_time', 'late') ELSE true END) as perf_complete
    FROM all_windows aw
    GROUP BY aw.week_of, aw.cycle_number, aw.week_in_cycle, aw.staff_id
  )
  SELECT
    wsm.week_of,
    wsm.cycle_number,
    wsm.week_in_cycle,
    COUNT(DISTINCT wsm.staff_id)::int as total_staff,
    COUNT(DISTINCT wsm.staff_id) FILTER (WHERE wsm.conf_complete)::int as conf_complete_count,
    COUNT(DISTINCT wsm.staff_id) FILTER (WHERE wsm.perf_complete)::int as perf_complete_count
  FROM week_staff_metrics wsm
  GROUP BY wsm.week_of, wsm.cycle_number, wsm.week_in_cycle
  ORDER BY wsm.week_of DESC;
$$;
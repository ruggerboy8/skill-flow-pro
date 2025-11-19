-- Fix get_staff_submission_windows RPC to match bigint type from view
CREATE OR REPLACE FUNCTION get_staff_submission_windows(
  p_staff_id uuid,
  p_since date DEFAULT NULL
)
RETURNS TABLE (
  week_of date,
  cycle integer,
  week_in_cycle integer,
  metric text,
  slot_index integer,
  action_id bigint,  -- Changed from integer to bigint
  required boolean,
  due_at timestamptz,
  submitted_at timestamptz,
  status text,
  on_time boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Enforce access control: staff can view their own, coaches can view their staff
  IF NOT (
    EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND user_id = auth.uid())
    OR is_coach_or_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.metric,
    v.slot_index,
    v.action_id,
    v.required,
    v.due_at,
    v.submitted_at,
    v.status,
    v.on_time
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.due_at >= p_since::timestamptz)
  ORDER BY v.due_at DESC;
END;
$$;

COMMENT ON FUNCTION get_staff_submission_windows IS 
  'Returns submission windows for a staff member. Properly counts missing submissions in on-time rate. p_since filters by due_at (NULL = all time).';
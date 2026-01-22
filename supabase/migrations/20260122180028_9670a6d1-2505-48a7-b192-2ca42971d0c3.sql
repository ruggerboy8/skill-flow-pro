-- Create table to track individual excused submissions
CREATE TABLE public.excused_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('confidence', 'performance')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(staff_id, week_of, metric)
);

-- Enable RLS
ALTER TABLE public.excused_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Super admins and org admins can manage excused submissions
CREATE POLICY "Admins can manage excused_submissions"
  ON public.excused_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff 
      WHERE staff.user_id = auth.uid() 
      AND (staff.is_super_admin = true OR staff.is_org_admin = true)
    )
  );

-- Index for faster lookups
CREATE INDEX idx_excused_submissions_staff_week ON public.excused_submissions(staff_id, week_of);

-- Update the get_staff_submission_windows function to exclude individually excused submissions
CREATE OR REPLACE FUNCTION get_staff_submission_windows(
  p_staff_id UUID,
  p_since DATE DEFAULT NULL
)
RETURNS TABLE(
  staff_id UUID,
  staff_name TEXT,
  week_of DATE,
  cycle_number INTEGER,
  week_in_cycle INTEGER,
  slot_index INTEGER,
  action_id BIGINT,
  is_self_select BOOLEAN,
  metric TEXT,
  status TEXT,
  submitted_at TIMESTAMPTZ,
  submitted_late BOOLEAN,
  due_at TIMESTAMPTZ,
  on_time BOOLEAN,
  required BOOLEAN,
  location_id UUID,
  role_id BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.staff_id,
    v.staff_name,
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.slot_index,
    v.action_id,
    v.is_self_select,
    v.metric,
    v.status,
    v.submitted_at,
    v.submitted_late,
    v.due_at,
    v.on_time,
    v.required,
    v.location_id,
    v.role_id
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.week_of >= p_since)
    AND v.week_of NOT IN (SELECT week_start_date FROM excused_weeks)
    AND NOT EXISTS (
      SELECT 1 FROM excused_submissions es
      WHERE es.staff_id = v.staff_id
        AND es.week_of = v.week_of
        AND es.metric = v.metric
    )
  ORDER BY v.week_of DESC, v.slot_index, v.metric;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
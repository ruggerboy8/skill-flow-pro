-- Fix security issue by adding RLS policy for the view
DROP VIEW IF EXISTS v_staff_week_status;

-- Create view without security definer issue
CREATE VIEW v_staff_week_status AS
SELECT
  s.id               AS staff_id,
  wf.id              AS weekly_focus_id,
  wf.iso_week,
  wf.iso_year,
  wf.role_id,
  ws.confidence_score,
  ws.performance_score
FROM weekly_focus wf
CROSS JOIN staff s
LEFT JOIN weekly_scores ws
  ON ws.staff_id = s.id
 AND ws.weekly_focus_id = wf.id;

-- Add RLS policy for the view
ALTER VIEW v_staff_week_status SET (security_invoker = true);

-- Create RLS policies for the view
CREATE POLICY "Users can view their own week status" 
ON v_staff_week_status 
FOR SELECT 
USING (staff_id IN (
  SELECT id FROM staff WHERE user_id = auth.uid()
));
-- Create view for staff week status to speed up tile queries
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
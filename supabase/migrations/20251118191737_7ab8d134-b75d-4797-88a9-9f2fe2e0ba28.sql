-- Create audit view for weekly_scores with full context
CREATE OR REPLACE VIEW view_weekly_scores_audit AS
SELECT 
  ws.id as score_id,
  ws.staff_id,
  s.name as staff_name,
  s.email as staff_email,
  s.role_id,
  r.role_name,
  s.primary_location_id,
  l.name as location_name,
  l.organization_id,
  o.name as organization_name,
  ws.weekly_focus_id,
  ws.week_of,
  -- Extract cycle and week from weekly_focus if applicable
  wf.cycle,
  wf.week_in_cycle,
  ws.site_action_id,
  ws.selected_action_id,
  ws.confidence_score,
  ws.confidence_date,
  ws.confidence_source,
  ws.confidence_late,
  ws.performance_score,
  ws.performance_date,
  ws.performance_source,
  ws.performance_late,
  ws.entered_by,
  ws.created_at,
  ws.updated_at
FROM weekly_scores ws
JOIN staff s ON s.id = ws.staff_id
LEFT JOIN roles r ON r.role_id = s.role_id
LEFT JOIN locations l ON l.id = s.primary_location_id
LEFT JOIN organizations o ON o.id = l.organization_id
LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
ORDER BY ws.created_at DESC;
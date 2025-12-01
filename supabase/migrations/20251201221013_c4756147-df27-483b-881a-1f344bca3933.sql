-- Re-run Phase 1.3: Link today's scores to assignments (now that gaps are filled)
UPDATE weekly_scores ws
SET assignment_id = ('assign:' || matches.assignment_id)
FROM (
  SELECT 
    s.id as staff_id,
    wa.id as assignment_id,
    wa.week_start_date,
    ws_inner.weekly_focus_id,
    ws_inner.id as score_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  JOIN weekly_scores ws_inner ON ws_inner.staff_id = s.id
  JOIN weekly_assignments wa 
    ON wa.location_id = l.id
    AND wa.role_id = s.role_id
    AND wa.week_start_date = ws_inner.week_of
    AND wa.legacy_focus_id::text = ws_inner.weekly_focus_id
  WHERE ws_inner.assignment_id IS NULL
    AND ws_inner.weekly_focus_id IS NOT NULL
    AND ws_inner.week_of >= '2025-12-01'
    AND ws_inner.created_at::date = '2025-12-01'
    AND EXISTS (
      SELECT 1 FROM weekly_focus wf
      WHERE wf.id::text = ws_inner.weekly_focus_id
        AND wf.cycle BETWEEN 1 AND 3
    )
) AS matches
WHERE ws.id = matches.score_id;
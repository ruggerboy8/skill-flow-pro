-- COMPREHENSIVE CYCLE 4 TRANSITION MONITORING QUERY
-- Run this tomorrow morning (2025-11-17) to verify the transition

-- 1. Location Cycle Status (which locations are in Cycle 4+)
SELECT 
  l.name as location,
  l.timezone,
  l.program_start_date,
  l.cycle_length_weeks,
  FLOOR(EXTRACT(DAY FROM (CURRENT_DATE - l.program_start_date)) / 7 / l.cycle_length_weeks) + 1 as current_cycle,
  MOD(FLOOR(EXTRACT(DAY FROM (CURRENT_DATE - l.program_start_date)) / 7)::integer, l.cycle_length_weeks) + 1 as week_in_cycle
FROM locations l
WHERE l.active = true
ORDER BY current_cycle DESC, l.name;

-- 2. Staff Status Summary by Location
SELECT 
  s.location_id,
  s.phase,
  s.source_used,
  COUNT(*) as staff_count,
  SUM(CASE WHEN s.required_count = s.conf_count + s.perf_count THEN 1 ELSE 0 END) as complete_count,
  SUM(CASE WHEN s.conf_count = 0 AND s.perf_count = 0 THEN 1 ELSE 0 END) as no_scores_count
FROM get_staff_statuses((SELECT user_id FROM staff WHERE is_super_admin = true LIMIT 1), NOW()::text) s
GROUP BY s.location_id, s.phase, s.source_used
ORDER BY s.location_id, s.phase;

-- 3. Weekly Plan Coverage (verify plans exist for all roles)
SELECT 
  r.role_id,
  r.role_name,
  wp.week_start_date,
  wp.status,
  COUNT(*) as slot_count,
  SUM(CASE WHEN wp.action_id IS NOT NULL THEN 1 ELSE 0 END) as filled_slots,
  SUM(CASE WHEN wp.self_select = true THEN 1 ELSE 0 END) as self_select_slots
FROM roles r
LEFT JOIN weekly_plan wp ON wp.role_id = r.role_id 
  AND wp.week_start_date = '2025-11-17'
  AND wp.org_id IS NULL
GROUP BY r.role_id, r.role_name, wp.week_start_date, wp.status
ORDER BY r.role_id;

-- 4. Staff Without Assignments (should be empty for Cycle 4+ staff)
SELECT 
  s.staff_id,
  s.staff_name,
  s.location_name,
  s.cycle_number,
  s.week_in_cycle,
  s.source_used,
  s.required_count,
  s.phase
FROM get_staff_statuses((SELECT user_id FROM staff WHERE is_super_admin = true LIMIT 1), NOW()::text) s
WHERE s.required_count = 0 
  AND s.cycle_number >= 4
ORDER BY s.location_name, s.staff_name;

-- 5. Backlog Status (verify rollover didn't add to backlog for Cycle 4+)
SELECT 
  s.name as staff_name,
  l.name as location_name,
  COUNT(ub.id) as backlog_count,
  MAX(ub.assigned_on) as last_added
FROM user_backlog_v2 ub
JOIN staff s ON s.id = ub.staff_id
LEFT JOIN locations l ON l.id = s.primary_location_id
WHERE ub.resolved_on IS NULL
GROUP BY s.id, s.name, l.name
HAVING COUNT(ub.id) > 0
ORDER BY backlog_count DESC;

-- 6. Weekly Scores Summary (verify proper score attribution)
SELECT 
  CASE 
    WHEN ws.weekly_focus_id LIKE 'plan:%' THEN 'global_plan'
    ELSE 'weekly_focus'
  END as source_type,
  COUNT(*) as score_count,
  COUNT(DISTINCT ws.staff_id) as unique_staff,
  SUM(CASE WHEN ws.confidence_score IS NOT NULL THEN 1 ELSE 0 END) as conf_scores,
  SUM(CASE WHEN ws.performance_score IS NOT NULL THEN 1 ELSE 0 END) as perf_scores
FROM weekly_scores ws
WHERE ws.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY source_type;

-- 7. Orphaned Scores Check (should be 0 after cleanup)
SELECT COUNT(*) as orphaned_count
FROM weekly_scores ws
WHERE ws.weekly_focus_id IS NOT NULL 
  AND ws.weekly_focus_id NOT LIKE 'plan:%'
  AND NOT EXISTS (
    SELECT 1 FROM weekly_focus wf 
    WHERE wf.id::text = ws.weekly_focus_id
  );

-- 8. Staff Activity Since Rollover
SELECT 
  s.name,
  l.name as location,
  s.last_activity_at,
  s.last_activity_kind,
  s.conf_count,
  s.perf_count,
  s.required_count,
  s.phase
FROM get_staff_statuses((SELECT user_id FROM staff WHERE is_super_admin = true LIMIT 1), NOW()::text) s
LEFT JOIN locations l ON l.id = s.location_id
WHERE s.cycle_number >= 4
  AND s.last_activity_at >= CURRENT_DATE
ORDER BY s.location_id, s.last_activity_at DESC NULLS LAST;

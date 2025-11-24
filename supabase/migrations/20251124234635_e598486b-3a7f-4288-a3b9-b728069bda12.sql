-- Weekly Assignments Cleanup: Regenerate from Curriculum (SQL Fixed)
-- This migration:
-- 1. Backs up all weekly_scores
-- 2. Deletes corrupted onboarding assignments
-- 3. Regenerates clean assignments from weekly_focus curriculum
-- 4. Reconnects scores to new assignments (orphans set to NULL)
-- 5. Preserves ALL score data

-- ============================================================================
-- PHASE 1: BACKUP & PREPARE
-- ============================================================================

-- Create backup of weekly_scores (before any changes)
CREATE TABLE IF NOT EXISTS weekly_scores_backup_20241124 AS 
SELECT * FROM weekly_scores;

-- Create log table for orphaned scores
CREATE TABLE IF NOT EXISTS orphaned_scores_log (
  score_id uuid,
  staff_id uuid,
  week_of date,
  action_id bigint,
  assignment_id text,
  reason text,
  logged_at timestamptz DEFAULT now()
);

-- Log scores that will become orphaned (no matching curriculum)
INSERT INTO orphaned_scores_log (score_id, staff_id, week_of, action_id, assignment_id, reason)
SELECT 
  ws.id,
  ws.staff_id,
  ws.week_of,
  COALESCE(ws.selected_action_id, ws.site_action_id),
  ws.assignment_id,
  'No matching curriculum action for this week'
FROM weekly_scores ws
WHERE ws.assignment_id LIKE 'assign:%'
  AND NOT EXISTS (
    SELECT 1 
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN organizations o ON o.id = l.organization_id
    JOIN weekly_focus wf ON wf.role_id = s.role_id
    WHERE s.id = ws.staff_id
      AND COALESCE(o.is_sandbox, false) = false
      AND wf.action_id = COALESCE(ws.selected_action_id, ws.site_action_id)
      AND wf.cycle = ((ws.week_of - l.program_start_date)::int / 7 / l.cycle_length_weeks) + 1
      AND wf.week_in_cycle = (((ws.week_of - l.program_start_date)::int / 7) % l.cycle_length_weeks) + 1
  );

-- ============================================================================
-- PHASE 2: DELETE CORRUPTED ASSIGNMENTS
-- ============================================================================

-- Delete all existing onboarding assignments (they're corrupted with duplicates)
DELETE FROM weekly_assignments 
WHERE source = 'onboarding' AND status = 'locked';

-- ============================================================================
-- PHASE 3: REGENERATE CLEAN ASSIGNMENTS FROM CURRICULUM
-- ============================================================================

-- For each REAL location (non-sandbox), generate assignments for all weeks up to today
WITH location_weeks AS (
  SELECT 
    l.id as location_id,
    l.organization_id,
    l.program_start_date,
    l.cycle_length_weeks,
    generate_series(
      date_trunc('week', l.program_start_date::timestamptz)::date,
      date_trunc('week', CURRENT_DATE::timestamptz)::date,
      interval '1 week'
    )::date as week_start
  FROM locations l
  JOIN organizations o ON o.id = l.organization_id
  WHERE l.active = true
    AND COALESCE(o.is_sandbox, false) = false
    AND l.program_start_date <= CURRENT_DATE
),
week_curriculum AS (
  SELECT 
    lw.location_id,
    lw.week_start,
    wf.role_id,
    wf.action_id,
    wf.competency_id,
    wf.self_select,
    wf.display_order,
    ((lw.week_start - lw.program_start_date)::int / 7 / lw.cycle_length_weeks) + 1 as cycle,
    (((lw.week_start - lw.program_start_date)::int / 7) % lw.cycle_length_weeks) + 1 as week_in_cycle
  FROM location_weeks lw
  CROSS JOIN LATERAL (
    SELECT DISTINCT role_id 
    FROM staff 
    WHERE primary_location_id = lw.location_id 
      AND role_id IS NOT NULL
  ) roles
  JOIN weekly_focus wf ON wf.role_id = roles.role_id
  WHERE wf.cycle = ((lw.week_start - lw.program_start_date)::int / 7 / lw.cycle_length_weeks) + 1
    AND wf.week_in_cycle = (((lw.week_start - lw.program_start_date)::int / 7) % lw.cycle_length_weeks) + 1
    AND lw.week_start <= CURRENT_DATE
)
INSERT INTO weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  org_id,
  action_id,
  competency_id,
  self_select,
  display_order,
  source,
  status
)
SELECT 
  week_start,
  role_id,
  location_id,
  NULL,
  action_id,
  competency_id,
  self_select,
  display_order,
  'onboarding',
  'locked'
FROM week_curriculum
ORDER BY week_start, role_id, location_id, display_order;

-- ============================================================================
-- PHASE 4: RECONNECT SCORES TO NEW ASSIGNMENTS
-- ============================================================================

-- Update scores that have site_action_id and match new assignments
WITH score_matches AS (
  SELECT DISTINCT
    ws.id as score_id,
    wa.id as new_assignment_id
  FROM weekly_scores ws
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  JOIN weekly_assignments wa ON 
    wa.location_id = s.primary_location_id
    AND wa.role_id = s.role_id
    AND wa.week_start_date = ws.week_of
    AND wa.action_id = ws.site_action_id
    AND wa.source = 'onboarding'
  WHERE ws.site_action_id IS NOT NULL
    AND ws.assignment_id LIKE 'assign:%'
    AND COALESCE(o.is_sandbox, false) = false
)
UPDATE weekly_scores ws
SET assignment_id = 'assign:' || sm.new_assignment_id
FROM score_matches sm
WHERE ws.id = sm.score_id;

-- Update scores that have selected_action_id (self-select) and match new assignments
WITH score_matches AS (
  SELECT DISTINCT
    ws.id as score_id,
    wa.id as new_assignment_id
  FROM weekly_scores ws
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  JOIN weekly_assignments wa ON 
    wa.location_id = s.primary_location_id
    AND wa.role_id = s.role_id
    AND wa.week_start_date = ws.week_of
    AND wa.self_select = true
    AND wa.source = 'onboarding'
  WHERE ws.selected_action_id IS NOT NULL
    AND ws.site_action_id IS NULL
    AND ws.assignment_id LIKE 'assign:%'
    AND COALESCE(o.is_sandbox, false) = false
)
UPDATE weekly_scores ws
SET assignment_id = 'assign:' || sm.new_assignment_id
FROM score_matches sm
WHERE ws.id = sm.score_id;

-- Set orphaned scores to NULL (preserved but not displayed)
UPDATE weekly_scores ws
SET assignment_id = NULL
WHERE ws.assignment_id LIKE 'assign:%'
  AND NOT EXISTS (
    SELECT 1 
    FROM weekly_assignments wa
    WHERE wa.id::text = substring(ws.assignment_id from 8)
  );

-- ============================================================================
-- PHASE 5: VERIFICATION QUERIES
-- ============================================================================

-- Verify: Count assignments per week/role/location (should all be 3)
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM (
    SELECT week_start_date, role_id, location_id, COUNT(*) as assignment_count
    FROM weekly_assignments
    WHERE source = 'onboarding' AND status = 'locked'
    GROUP BY week_start_date, role_id, location_id
    HAVING COUNT(*) != 3
  ) violations;
  
  IF bad_count > 0 THEN
    RAISE WARNING 'Found % week/role/location combinations with != 3 assignments', bad_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All weeks have exactly 3 assignments';
  END IF;
END $$;

-- Verify: Count reconnected vs orphaned scores
DO $$
DECLARE
  total_scores int;
  connected_scores int;
  orphaned_scores int;
BEGIN
  SELECT COUNT(*) INTO total_scores FROM weekly_scores;
  SELECT COUNT(*) INTO connected_scores FROM weekly_scores WHERE assignment_id IS NOT NULL;
  SELECT COUNT(*) INTO orphaned_scores FROM weekly_scores WHERE assignment_id IS NULL;
  
  RAISE NOTICE 'Total scores: %, Connected: %, Orphaned: %', total_scores, connected_scores, orphaned_scores;
END $$;

-- Verify: Show Gissell's assignments for Nov 17
DO $$
DECLARE
  gissell_count int;
BEGIN
  SELECT COUNT(*) INTO gissell_count
  FROM weekly_assignments wa
  JOIN staff s ON s.primary_location_id = wa.location_id AND s.role_id = wa.role_id
  WHERE s.name = 'Gissell Treviño'
    AND wa.week_start_date = '2024-11-17'
    AND wa.source = 'onboarding';
    
  RAISE NOTICE 'Gissell has % assignments for week of Nov 17', gissell_count;
END $$;
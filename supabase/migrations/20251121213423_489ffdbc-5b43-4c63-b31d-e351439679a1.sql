
-- ============================================
-- PHASE 1: Clean Test Data
-- ============================================

-- Delete test scores referencing plan:* assignments
DELETE FROM weekly_scores 
WHERE weekly_focus_id LIKE 'plan:%';

-- Delete old weekly_plan entries (keep only 2025-12-01)
DELETE FROM weekly_plan 
WHERE week_start_date != '2025-12-01';

-- ============================================
-- PHASE 2: Migrate Week 18 to weekly_assignments
-- ============================================

-- Migrate Cycle 3 Week 6 (2025-11-17) from weekly_focus to weekly_assignments
-- for the 7 Texas locations (Allen, Buda, Frisco, Kyle, McKinney, South Austin, Steiner Ranch)

-- Role 1 (DFI) - 3 slots per location
INSERT INTO weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  source,
  status,
  action_id,
  competency_id,
  self_select,
  display_order,
  legacy_focus_id
)
SELECT 
  '2025-11-17'::date,
  1,
  l.id,
  'onboarding',
  'locked',
  wf.action_id,
  wf.competency_id,
  wf.self_select,
  wf.display_order,
  wf.id
FROM locations l
CROSS JOIN weekly_focus wf
WHERE l.id IN (
  '9f3c7067-53d5-472e-8d98-ea2fb037d739', -- Allen
  '8bf335bc-68a0-4b7c-87a0-9f0a2abd8dc4', -- Buda
  '2b804783-93a2-4b3a-8ae7-5e61b08a2887', -- Frisco
  'f9d29710-36ec-4ab2-89c5-f8808e3f8862', -- Kyle
  'f6408c46-cad0-438b-a939-6132fbe2410f', -- McKinney
  'd411f0d2-f40b-4837-97de-ccd73438a960', -- South Austin
  '0f073fbc-99b6-4648-93c8-2f2103f42ac8'  -- Steiner Ranch
)
AND wf.cycle = 3
AND wf.week_in_cycle = 6
AND wf.role_id = 1
ORDER BY l.id, wf.display_order;

-- Role 2 (RDA) - 3 slots per location
INSERT INTO weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  source,
  status,
  action_id,
  competency_id,
  self_select,
  display_order,
  legacy_focus_id
)
SELECT 
  '2025-11-17'::date,
  2,
  l.id,
  'onboarding',
  'locked',
  wf.action_id,
  wf.competency_id,
  wf.self_select,
  wf.display_order,
  wf.id
FROM locations l
CROSS JOIN weekly_focus wf
WHERE l.id IN (
  '9f3c7067-53d5-472e-8d98-ea2fb037d739', -- Allen
  '8bf335bc-68a0-4b7c-87a0-9f0a2abd8dc4', -- Buda
  '2b804783-93a2-4b3a-8ae7-5e61b08a2887', -- Frisco
  'f9d29710-36ec-4ab2-89c5-f8808e3f8862', -- Kyle
  'f6408c46-cad0-438b-a939-6132fbe2410f', -- McKinney
  'd411f0d2-f40b-4837-97de-ccd73438a960', -- South Austin
  '0f073fbc-99b6-4648-93c8-2f2103f42ac8'  -- Steiner Ranch
)
AND wf.cycle = 3
AND wf.week_in_cycle = 6
AND wf.role_id = 2
ORDER BY l.id, wf.display_order;

-- Add deprecation comment to weekly_focus table
COMMENT ON TABLE weekly_focus IS 'DEPRECATED: This table is no longer used. All assignment data has been migrated to weekly_assignments. Kept for historical reference only.';

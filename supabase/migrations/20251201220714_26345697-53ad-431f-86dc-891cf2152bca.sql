-- Phase 1.1: Backfill legacy_focus_id on existing weekly_assignments (FIXED)
-- Link existing weekly_assignments rows back to their source weekly_focus templates

UPDATE weekly_assignments wa
SET legacy_focus_id = wf.id
FROM weekly_focus wf,
     locations l
WHERE wa.legacy_focus_id IS NULL
  AND wa.source = 'onboarding'
  AND wa.location_id = l.id
  AND wa.role_id = wf.role_id
  AND wf.cycle = (
    -- Derive cycle from week_start_date and location's program_start_date
    FLOOR(
      (wa.week_start_date - l.program_start_date) / (l.cycle_length_weeks * 7)
    ) + 1
  )
  AND wf.week_in_cycle = (
    -- Derive week_in_cycle from week_start_date
    MOD(
      (wa.week_start_date - l.program_start_date) / 7,
      l.cycle_length_weeks
    ) + 1
  );
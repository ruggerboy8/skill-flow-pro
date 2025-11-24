-- Delete test global assignments (all before Dec 1st, 2025)
-- Keep only Dec 1st assignments which are the real production data
DELETE FROM weekly_assignments 
WHERE superseded_at IS NULL
  AND location_id IS NULL 
  AND org_id IS NULL
  AND week_start_date < '2025-12-01';
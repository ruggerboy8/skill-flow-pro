
-- Delete Johno Oberly's most recent week scores (2025-12-29)
DELETE FROM weekly_scores 
WHERE staff_id = '0df48cba-1e22-4588-8685-72da2566f2e5' 
  AND week_of = '2025-12-29';

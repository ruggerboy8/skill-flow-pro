-- Rename get_staff_all_weekly_scores_deprecated back to get_staff_all_weekly_scores
-- This function is actively used and not deprecated, so restoring the original name

DROP FUNCTION IF EXISTS get_staff_all_weekly_scores(uuid);

ALTER FUNCTION get_staff_all_weekly_scores_deprecated(uuid) 
RENAME TO get_staff_all_weekly_scores;
-- Fix the staff_id values in weekly_scores table
-- Replace auth.user_id values with the correct staff.id values
UPDATE weekly_scores 
SET staff_id = staff.id
FROM staff
WHERE weekly_scores.staff_id = staff.user_id;
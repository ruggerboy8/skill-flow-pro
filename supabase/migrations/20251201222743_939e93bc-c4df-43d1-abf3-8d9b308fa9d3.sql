-- Drop old text-based get_my_weekly_scores function (causes overload conflict)
DROP FUNCTION IF EXISTS get_my_weekly_scores(text);

-- Ensure only the date-based version exists (already created in previous migration)
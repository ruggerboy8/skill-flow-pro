-- Fix remaining functions with mutable search paths
ALTER FUNCTION get_weekly_review(INTEGER, INTEGER, BIGINT, UUID) SET search_path = 'public';
ALTER FUNCTION touch_dates() SET search_path = 'public';
-- Fix remaining security warnings for functions missing search_path
ALTER FUNCTION get_evaluations_summary(UUID) SET search_path = 'public';
ALTER FUNCTION get_last_progress_week(UUID) SET search_path = 'public';
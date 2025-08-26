-- Fix security issues by setting proper search_path for functions
ALTER FUNCTION retime_backfill_cycle(UUID, BIGINT, INTEGER) SET search_path = 'public';
ALTER FUNCTION backfill_historical_score_timestamps(UUID, BOOLEAN, INTEGER) SET search_path = 'public';
ALTER FUNCTION needs_backfill(UUID, BIGINT) SET search_path = 'public';
-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260720184058

-- Revert the premature drop: some deployed/older frontend code still selects
-- staff.home_route, and dropping it made every profile query fail ("failed to
-- load profile"). Restore it (unused, nullable, default '/'), so both old and new
-- code work. The real drop should happen only after the column-free code is live
-- everywhere.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS home_route text DEFAULT '/';
-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260720181020

-- Phase 1 cleanup (navigation-remediation-plan.md, N10): staff.home_route was
-- fetched but never used for routing (landing is computed in useUserRole). No
-- function/view/policy references it. Safe to drop. Idempotent.
ALTER TABLE public.staff DROP COLUMN IF EXISTS home_route;
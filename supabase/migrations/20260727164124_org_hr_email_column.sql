-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260727164124

-- Phase C U2: per-organization HR contact for offboarding exports.
alter table public.organizations add column if not exists hr_email text;
update public.organizations set hr_email = 'falvarez@alcandentalcooperative.com'
  where name = 'Alcan Pediatric Dental' and hr_email is null;
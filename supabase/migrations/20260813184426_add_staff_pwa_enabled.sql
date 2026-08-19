-- Recovered from production 2026-08-18 (GOV-1).
-- This migration was applied to production but never committed. Recovered from
-- supabase_migrations.schema_migrations so the repo matches production.
-- Applied version: 20260813184426

-- PWA rollout flag: gates service worker registration, install banner, and
-- push onboarding per user. Additive and default-off, so deployed code is
-- unaffected (DDL-leads-code is safe for column ADDs; only drops must lag).
alter table public.staff add column if not exists pwa_enabled boolean not null default false;
comment on column public.staff.pwa_enabled is 'Gates PWA activation (SW registration, install banner, push onboarding). Staged rollout lever: test user -> all locations. See docs/features/pwa-push-notifications.md';
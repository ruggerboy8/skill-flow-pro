-- Phase 1: Make weekly_plan.org_id nullable for global plans
ALTER TABLE weekly_plan ALTER COLUMN org_id DROP NOT NULL;

-- Add global uniqueness index (role_id + week_start_date + display_order where org_id IS NULL)
DROP INDEX IF EXISTS uq_weekly_plan_org_role_week_order;
CREATE UNIQUE INDEX uq_weekly_plan_global_role_week_order
  ON weekly_plan (role_id, week_start_date, display_order)
  WHERE org_id IS NULL;

-- Set global timezone in app_kv
INSERT INTO app_kv (key, value, updated_at)
VALUES ('sequencer:global_timezone', '{"timezone": "America/Chicago"}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = '{"timezone": "America/Chicago"}'::jsonb, updated_at = now();
-- Phase 1: Enhanced auditing and provenance tracking

-- 1) sequencer_runs: allow global_cron mode + richer audit
ALTER TABLE sequencer_runs
  DROP CONSTRAINT IF EXISTS sequencer_runs_mode_check;
ALTER TABLE sequencer_runs
  ADD CONSTRAINT sequencer_runs_mode_check
  CHECK (mode IN ('cron','manual','global_cron'));

ALTER TABLE sequencer_runs
  ADD COLUMN IF NOT EXISTS as_of timestamptz,
  ADD COLUMN IF NOT EXISTS picks jsonb,
  ADD COLUMN IF NOT EXISTS rank_version text,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2) weekly_plan: store provenance + rank snapshot
ALTER TABLE weekly_plan
  ADD COLUMN IF NOT EXISTS rank_version text,
  ADD COLUMN IF NOT EXISTS rank_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS generated_by text
    CHECK (generated_by IN ('auto','manual')) DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS overridden boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;

-- 3) global uniqueness (org_id IS NULL = global plan)
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plan_global
  ON weekly_plan (role_id, week_start_date, display_order)
  WHERE org_id IS NULL;

COMMENT ON COLUMN sequencer_runs.as_of IS 'Effective timestamp used for the sequencer run';
COMMENT ON COLUMN sequencer_runs.picks IS 'Top-N ranked moves from sequencer-rank';
COMMENT ON COLUMN sequencer_runs.rank_version IS 'Sequencer engine version used';
COMMENT ON COLUMN sequencer_runs.notes IS 'Human-readable summary of the run';

COMMENT ON COLUMN weekly_plan.rank_version IS 'Sequencer engine version that generated this plan';
COMMENT ON COLUMN weekly_plan.rank_snapshot IS 'Full rank payload (top picks + weights) at generation time';
COMMENT ON COLUMN weekly_plan.generated_by IS 'Source: auto (sequencer) or manual (admin override)';
COMMENT ON COLUMN weekly_plan.overridden IS 'True if admin manually changed this plan';
COMMENT ON COLUMN weekly_plan.overridden_at IS 'Timestamp of manual override';
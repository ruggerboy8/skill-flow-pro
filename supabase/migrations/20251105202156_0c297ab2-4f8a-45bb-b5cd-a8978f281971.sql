-- Migration: Create weekly_plan and sequencer_runs tables with org scoping

-- 1) Create weekly_plan table
CREATE TABLE IF NOT EXISTS weekly_plan (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id int NOT NULL REFERENCES roles(role_id),
  week_start_date date NOT NULL,
  display_order int NOT NULL CHECK (display_order BETWEEN 1 AND 3),
  action_id bigint NULL REFERENCES pro_moves(action_id),
  self_select boolean NOT NULL DEFAULT false,
  
  -- Status tracking
  status text NOT NULL CHECK (status IN ('proposed','locked')) DEFAULT 'proposed',
  generated_by text NOT NULL CHECK (generated_by IN ('auto','manual')) DEFAULT 'auto',
  overridden boolean NOT NULL DEFAULT false,
  overridden_at timestamptz NULL,
  locked_at timestamptz NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Enforce self-select XOR action_id
  CONSTRAINT chk_self_select_xor_action CHECK (
    (self_select = true AND action_id IS NULL) OR
    (self_select = false AND action_id IS NOT NULL)
  ),
  
  -- Multi-tenant unique constraint
  CONSTRAINT uq_week UNIQUE (org_id, role_id, week_start_date, display_order)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_plan_org_role_week ON weekly_plan(org_id, role_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_status ON weekly_plan(org_id, week_start_date, status);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_overridden ON weekly_plan(org_id, overridden, week_start_date);

-- 2) Create sequencer_runs table
CREATE TABLE IF NOT EXISTS sequencer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  role_id int NOT NULL,
  target_week_start date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('cron','manual')),
  success boolean NOT NULL,
  weights jsonb,
  config jsonb,
  logs text[],
  error_message text NULL,
  lock_at_local text
);

CREATE INDEX IF NOT EXISTS idx_seq_runs_org_week_role ON sequencer_runs(org_id, target_week_start, role_id);
CREATE INDEX IF NOT EXISTS idx_seq_runs_time ON sequencer_runs(run_at DESC);

-- 3) Add is_sandbox flag to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS is_sandbox boolean DEFAULT false;

-- 4) Add onboarding_active flag to locations
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS onboarding_active boolean DEFAULT true;
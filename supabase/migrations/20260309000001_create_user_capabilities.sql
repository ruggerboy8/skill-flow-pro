-- 20260309000001_create_user_capabilities.sql
-- Granular permission toggles per staff member.
-- Replaces the boolean flag columns on the staff table over time.
-- Staff flags (is_coach, is_org_admin, etc.) remain in place as fallback during migration.
-- When a user_capabilities row exists, app code prefers it over staff flags.

CREATE TABLE IF NOT EXISTS user_capabilities (
  -- One row per staff member; cascades on delete
  staff_id               UUID PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,

  -- Participation
  is_participant         BOOLEAN NOT NULL DEFAULT false,       -- submits ProMoves, has a role, accrues assignments
  participation_start_at TIMESTAMPTZ,                          -- null = track from account creation

  -- What they can DO (capability toggles)
  can_view_submissions   BOOLEAN NOT NULL DEFAULT false,       -- see other staff's submissions (coach / manager view)
  can_submit_evals       BOOLEAN NOT NULL DEFAULT false,       -- score/evaluate other staff
  can_review_evals       BOOLEAN NOT NULL DEFAULT false,       -- review / approve submitted evals
  can_invite_users       BOOLEAN NOT NULL DEFAULT false,       -- send invitations to new staff
  can_manage_library     BOOLEAN NOT NULL DEFAULT false,       -- show/hide pro moves for the org
  can_manage_locations   BOOLEAN NOT NULL DEFAULT false,       -- edit location settings
  can_manage_users       BOOLEAN NOT NULL DEFAULT false,       -- edit other users' profiles / capabilities

  -- Elevated admin flags
  is_org_admin           BOOLEAN NOT NULL DEFAULT false,       -- full admin for their organisation
  is_platform_admin      BOOLEAN NOT NULL DEFAULT false,       -- super-admin across all organisations

  -- Audit
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_user_capabilities_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_capabilities_updated_at
  BEFORE UPDATE ON user_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_user_capabilities_updated_at();

-- ─── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE user_capabilities ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read their own capabilities row
CREATE POLICY "uc_self_read"
  ON user_capabilities
  FOR SELECT
  USING (
    staff_id = (
      SELECT id FROM staff WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Org admins and super-admins can read all capabilities rows (Phase 1: single org)
CREATE POLICY "uc_admin_read"
  ON user_capabilities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR is_org_admin = true)
    )
  );

-- Org admins and super-admins can write all capabilities rows.
-- Note: the admin-users edge function uses the service role key and bypasses RLS.
-- This policy covers direct API access by admin users.
CREATE POLICY "uc_admin_write"
  ON user_capabilities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR is_org_admin = true)
    )
  );

-- ─── Sanity check ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_capabilities'
  ) THEN
    RAISE EXCEPTION 'user_capabilities table was not created successfully';
  END IF;
  RAISE NOTICE 'user_capabilities table created successfully';
END;
$$;

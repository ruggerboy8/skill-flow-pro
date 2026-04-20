-- Deputy OAuth connections
-- Stores the access/refresh tokens for the connected Deputy install.
-- One row per organization. Service role only for token reads; org admins
-- can read non-sensitive status columns via the select policy below.

CREATE TABLE public.deputy_connections (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deputy_install    text        NOT NULL,          -- e.g. "d2215826013715"
  deputy_region     text        NOT NULL,          -- "na", "us", "au", "eu", "uk"
  access_token      text        NOT NULL,          -- expires every 24 h
  refresh_token     text        NOT NULL,          -- rotates on every use
  token_expires_at  timestamptz NOT NULL,
  connected_at      timestamptz DEFAULT NOW(),
  connected_by      uuid        REFERENCES public.staff(id) ON DELETE SET NULL,
  last_sync_at      timestamptz,
  last_sync_status  text        CHECK (last_sync_status IN ('success', 'error', 'partial')),
  last_sync_error   text,
  UNIQUE (organization_id)
);

ALTER TABLE public.deputy_connections ENABLE ROW LEVEL SECURITY;

-- Org admins can read connection status rows (not tokens — never select those from the frontend)
CREATE POLICY "org_admins_can_view_deputy_connection"
  ON public.deputy_connections FOR SELECT
  USING (
    organization_id = current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )
  );

-- Sanity check
DO $$
BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deputy_connections'
  )), 'deputy_connections table was not created';
  RAISE NOTICE 'deputy_connections ✓';
END $$;

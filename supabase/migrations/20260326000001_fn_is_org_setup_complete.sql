-- Migration: is_org_setup_complete
-- Server-side helper that returns true when an org has completed both
-- the positions step (organization_role_names rows exist) AND the schedule
-- step (at least one active location has conf_due_day set).
--
-- Used by AdminPage to show/hide the setup wizard banner, and by the
-- platform console to display setup status per org.
--
-- Must run after 20260306190002 (which adds practice_groups.organization_id).

CREATE OR REPLACE FUNCTION public.is_org_setup_complete(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      SELECT COUNT(*)
      FROM organization_role_names
      WHERE org_id = p_org_id
    ) > 0
    AND
    (
      SELECT COUNT(*)
      FROM locations l
      JOIN practice_groups pg ON pg.id = l.group_id
      WHERE pg.organization_id = p_org_id
        AND l.active = true
        AND l.conf_due_day IS NOT NULL
    ) > 0;
$$;

-- Grant execute to authenticated users (RLS on underlying tables still applies)
GRANT EXECUTE ON FUNCTION public.is_org_setup_complete(UUID) TO authenticated;

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_org_setup_complete'
  ) THEN
    RAISE EXCEPTION 'is_org_setup_complete function was not created';
  END IF;
  RAISE NOTICE 'is_org_setup_complete created successfully';
END $$;

-- Migration: add can_manage_assignments capability
-- Controls who can access the Builder (/builder) to set weekly pro move assignments.
-- This decouples builder access from full org admin, allowing delegation to e.g.
-- a clinical coordinator or training lead.

ALTER TABLE public.user_capabilities
  ADD COLUMN IF NOT EXISTS can_manage_assignments BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing org admins and platform admins automatically get this capability
UPDATE public.user_capabilities
SET can_manage_assignments = true
WHERE is_org_admin = true OR is_platform_admin = true;

-- Sanity check
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.user_capabilities
  WHERE can_manage_assignments = true;
  RAISE NOTICE 'Backfilled can_manage_assignments = true for % rows', v_count;
END $$;

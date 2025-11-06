-- Clear global weekly_plan data (for testing/development)
-- This removes all global (org_id IS NULL) weekly plan assignments
DELETE FROM weekly_plan WHERE org_id IS NULL;

-- Log the action
DO $$
BEGIN
  RAISE NOTICE 'Cleared global weekly_plan data for testing';
END $$;
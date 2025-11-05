
-- Delete test global weekly_plan entries
DELETE FROM weekly_plan
WHERE org_id IS NULL;

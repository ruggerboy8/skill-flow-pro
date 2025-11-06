-- Clean up test global weekly_plan entries before fresh rollover test
DELETE FROM weekly_plan
WHERE org_id IS NULL;
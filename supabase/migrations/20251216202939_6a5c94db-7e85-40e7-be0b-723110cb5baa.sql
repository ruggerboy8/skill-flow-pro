-- Fix confidence_late flags for Ana and Maria who submitted before the new 2pm deadline
-- Ana submitted at 12:55 PM Mountain time (19:55 UTC)
-- Maria submitted at 12:55 PM Mountain time (19:55 UTC)
-- Both are before 2:00 PM Mountain (21:00 UTC), so should be marked not late

UPDATE weekly_scores
SET confidence_late = false
WHERE id IN (
  -- Ana's scores
  '374e2aed-d823-41b7-bc25-19a7e119e8dc',
  '7f38d4e7-ba36-4462-9b96-7facbee82706',
  'de1e30f4-f516-4d44-a750-35317f372518',
  -- Maria's scores
  '9b93c159-a487-45a1-958e-12eeda3921d8',
  '9dbdfd28-734e-4332-8455-46cf2ac24e4e',
  '529f0ffa-a42f-4a5e-b4a6-9e67f7095c63'
);
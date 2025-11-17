
-- Delete Taylor Dredla's three specific confidence scores
DELETE FROM weekly_scores
WHERE staff_id = 'a1e06b98-b974-4e3c-8028-44291fe7a173'
AND id IN (
  '1b3f0ae2-90cf-41b8-b2d8-a77bbd61710e',  -- Case Acceptance: Before dismissal (CONF 4)
  '905d49b6-e839-429f-a3a8-df2b9ca724d0',  -- Case Acceptance: When cost is a concern (CONF 4)
  '55ebab35-fa6f-4b19-ba34-4b5a0485802f'   -- Case Acceptance: When pulling up radiographs (CONF 2)
);

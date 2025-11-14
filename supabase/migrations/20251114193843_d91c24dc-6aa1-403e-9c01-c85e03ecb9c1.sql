
-- Delete orphaned weekly_scores for johno that reference old plan IDs
DELETE FROM weekly_scores
WHERE id IN (
  'a74122b9-bc89-4e00-9b31-7ebd942559b0',
  '4d407e2b-4868-4ce0-ad5e-26f8305010a4',
  '1e5e966b-0f5f-42a4-9d83-071e2bc80ca1'
);

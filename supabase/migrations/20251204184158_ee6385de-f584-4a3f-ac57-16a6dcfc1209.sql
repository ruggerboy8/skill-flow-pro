-- Delete orphaned scores for Taylor that have mismatched assignment_week vs week_of
-- These 3 records were created Nov 18 for Nov 17 assignments but had confidence_date updated to Dec 1
-- causing week_of trigger to set them to Dec 1, orphaning them from their actual assignment week

DELETE FROM weekly_scores
WHERE id IN (
  'b940cf62-98fe-4cae-b9d9-35465924aabc',
  '15eded85-9516-47ea-88c7-6e10d3fae78a', 
  '35b0c8d1-ac49-41bf-bccd-24e476c79d9e'
);
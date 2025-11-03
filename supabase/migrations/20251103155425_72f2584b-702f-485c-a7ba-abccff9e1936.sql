
-- Clear confidence scores for Melanie Crnkovich from Lake Orion for current week (Cycle 1, Week 4)
UPDATE weekly_scores
SET 
  confidence_score = NULL,
  confidence_date = NULL,
  updated_at = now()
WHERE id IN (
  'b78c8f28-c508-4b50-b8f8-4df1c14e0f35',
  'a31a02d5-66b3-4d81-872f-ab7c07b0efbe',
  'eabd8691-af6b-48fd-aaae-86db595d4ec9'
);

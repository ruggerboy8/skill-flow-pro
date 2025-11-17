-- Update Alexia Andari's confidence submission timestamps to Monday Nov 17, 8:30 AM CT
UPDATE weekly_scores
SET 
  confidence_date = '2025-11-17 14:30:00+00',
  updated_at = now()
WHERE id IN (
  '26fc2097-c104-4a37-9564-d25a14c24962',
  '7e4f7d81-349b-4196-b0eb-c8e4e6a282e9',
  'c124168d-017e-404f-aa3c-d17a41476cde'
)
AND staff_id = '27e1dc14-1f68-4925-984d-31dc08dbe079';
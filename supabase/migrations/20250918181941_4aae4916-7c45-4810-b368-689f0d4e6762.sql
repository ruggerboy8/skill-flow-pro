-- Restore Kelly Acuna's confidence scores based on the log entries  
UPDATE weekly_scores 
SET 
  confidence_score = CASE 
    WHEN weekly_focus_id = 'e955e705-362e-4fd0-8607-f4fe470aa16b' THEN 4
    WHEN weekly_focus_id = 'ca75f0ee-4b72-4053-9405-7b84cf9cb6c1' THEN 4
    WHEN weekly_focus_id = '6f5ac759-2c03-45de-b0a7-15cb5f02b516' THEN 3
  END,
  confidence_date = '2025-09-16 10:00:00-05'::timestamptz
WHERE staff_id = '19fb10b7-1a4c-43a9-9093-6efa5c35838e'
  AND weekly_focus_id IN (
    'e955e705-362e-4fd0-8607-f4fe470aa16b',
    'ca75f0ee-4b72-4053-9405-7b84cf9cb6c1', 
    '6f5ac759-2c03-45de-b0a7-15cb5f02b516'
  )
  AND confidence_score IS NULL;
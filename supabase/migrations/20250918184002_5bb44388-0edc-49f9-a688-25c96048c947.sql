-- Remove Kelly Acuna's incorrectly added confidence scores for Cycle 1, Week 1
-- These were added in error and she should resubmit them properly
DELETE FROM weekly_scores 
WHERE staff_id = '19fb10b7-1a4c-43a9-9093-6efa5c35838e'
  AND weekly_focus_id IN (
    'e955e705-362e-4fd0-8607-f4fe470aa16b',
    'ca75f0ee-4b72-4053-9405-7b84cf9cb6c1', 
    '6f5ac759-2c03-45de-b0a7-15cb5f02b516'
  )
  AND confidence_score IS NOT NULL
  AND confidence_date = '2025-09-16 10:00:00-05'::timestamptz;
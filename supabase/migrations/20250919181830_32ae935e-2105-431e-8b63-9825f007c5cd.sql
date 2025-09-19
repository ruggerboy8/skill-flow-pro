-- Insert scores for Kelly Acuna's cycle 1 week 1 with on-time timestamps
INSERT INTO weekly_scores (
  staff_id, 
  weekly_focus_id, 
  confidence_score, 
  performance_score,
  confidence_date,
  performance_date,
  confidence_late,
  performance_late,
  confidence_source,
  performance_source
) VALUES 
-- Focus 1: confidence 4, performance 4
('19fb10b7-1a4c-43a9-9093-6efa5c35838e', 'ca75f0ee-4b72-4053-9405-7b84cf9cb6c1', 4, 4,
 '2025-09-16 18:00:00-05'::timestamptz, '2025-09-19 17:00:00-05'::timestamptz, 
 false, false, 'live', 'live'),
-- Focus 2: confidence 4, performance 4  
('19fb10b7-1a4c-43a9-9093-6efa5c35838e', 'e955e705-362e-4fd0-8607-f4fe470aa16b', 4, 4,
 '2025-09-16 18:15:00-05'::timestamptz, '2025-09-19 17:15:00-05'::timestamptz,
 false, false, 'live', 'live'),
-- Focus 3: confidence 3, performance 3
('19fb10b7-1a4c-43a9-9093-6efa5c35838e', '6f5ac759-2c03-45de-b0a7-15cb5f02b516', 3, 3,
 '2025-09-16 18:30:00-05'::timestamptz, '2025-09-19 17:30:00-05'::timestamptz,
 false, false, 'live', 'live')
ON CONFLICT (staff_id, weekly_focus_id) DO UPDATE SET
  confidence_score = EXCLUDED.confidence_score,
  performance_score = EXCLUDED.performance_score,
  confidence_date = EXCLUDED.confidence_date,
  performance_date = EXCLUDED.performance_date,
  confidence_late = EXCLUDED.confidence_late,
  performance_late = EXCLUDED.performance_late,
  confidence_source = EXCLUDED.confidence_source,
  performance_source = EXCLUDED.performance_source;
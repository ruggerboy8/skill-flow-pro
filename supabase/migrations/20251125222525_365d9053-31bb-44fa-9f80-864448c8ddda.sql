-- Fix Kelly's participation_start_at to Nov 10, 2025 (not 2024)
UPDATE staff 
SET participation_start_at = '2025-11-10'
WHERE id = '19fb10b7-1a4c-43a9-9093-6efa5c35838e';
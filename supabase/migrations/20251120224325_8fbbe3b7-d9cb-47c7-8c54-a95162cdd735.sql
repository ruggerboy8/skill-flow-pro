
-- Update Kelly Acuna's participation_start_at to her first actual submission week
-- This prevents weeks 2025-09-15 and 2025-09-22 from counting as required
UPDATE staff
SET participation_start_at = '2025-09-29 00:00:00+00'::timestamptz
WHERE id = '19fb10b7-1a4c-43a9-9093-6efa5c35838e';

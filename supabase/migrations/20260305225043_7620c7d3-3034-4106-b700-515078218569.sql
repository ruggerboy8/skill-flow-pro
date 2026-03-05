-- Batch update participation_start_at for all active office managers to next Monday (2026-03-09)
UPDATE staff
SET participation_start_at = '2026-03-09T00:00:00+00',
    updated_at = now()
WHERE is_office_manager = true
  AND is_paused = false;
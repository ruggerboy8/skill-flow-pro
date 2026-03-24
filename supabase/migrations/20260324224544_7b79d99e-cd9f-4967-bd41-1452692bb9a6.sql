
-- One-time fix: reassign all mismatched evaluations to staff's current location
-- Excludes Johno Oberly (sandbox user)
UPDATE evaluations e
SET location_id = s.primary_location_id,
    updated_at = now()
FROM staff s
WHERE e.staff_id = s.id
  AND e.location_id != s.primary_location_id
  AND s.name != 'Johno Oberly';

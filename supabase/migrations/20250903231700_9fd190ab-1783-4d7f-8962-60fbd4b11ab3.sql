-- Mark Kaylie Aguilar as new user (no backfill needed)
UPDATE public.staff
SET participation_start_at = now()
WHERE name = 'Kaylie Aguilar';
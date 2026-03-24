-- Fix Mallorie's evaluations: move to current location (Buda)
UPDATE evaluations
SET location_id = '8bf335bc-68a0-4b7c-87a0-9f0a2abd8dc4'
WHERE staff_id = 'e436da9c-7269-4cdb-864d-7c75233b34d2';

-- Create trigger function to sync evaluation location when staff location changes
CREATE OR REPLACE FUNCTION public.sync_eval_location_on_staff_move()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when primary_location_id actually changes
  IF OLD.primary_location_id IS DISTINCT FROM NEW.primary_location_id THEN
    UPDATE evaluations
    SET location_id = NEW.primary_location_id,
        updated_at = now()
    WHERE staff_id = NEW.id
      AND location_id = OLD.primary_location_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to staff table
DROP TRIGGER IF EXISTS trg_sync_eval_location ON staff;
CREATE TRIGGER trg_sync_eval_location
  AFTER UPDATE OF primary_location_id ON staff
  FOR EACH ROW
  EXECUTE FUNCTION sync_eval_location_on_staff_move();
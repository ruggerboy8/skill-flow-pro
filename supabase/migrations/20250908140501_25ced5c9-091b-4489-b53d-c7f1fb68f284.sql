-- Backfill location and organization text fields for existing staff records
UPDATE staff 
SET 
  location = l.name,
  organization = o.name
FROM locations l
JOIN organizations o ON o.id = l.organization_id
WHERE staff.primary_location_id = l.id
  AND (staff.location IS NULL OR staff.organization IS NULL);

-- Create trigger function to automatically update text fields when primary_location_id changes
CREATE OR REPLACE FUNCTION update_staff_location_organization()
RETURNS TRIGGER AS $$
BEGIN
  -- Update location and organization text fields based on primary_location_id
  IF NEW.primary_location_id IS NOT NULL THEN
    SELECT l.name, o.name
    INTO NEW.location, NEW.organization
    FROM locations l
    JOIN organizations o ON o.id = l.organization_id
    WHERE l.id = NEW.primary_location_id;
  ELSE
    NEW.location := NULL;
    NEW.organization := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update location/organization text fields
DROP TRIGGER IF EXISTS trigger_update_staff_location_organization ON staff;
CREATE TRIGGER trigger_update_staff_location_organization
  BEFORE INSERT OR UPDATE OF primary_location_id ON staff
  FOR EACH ROW
  EXECUTE FUNCTION update_staff_location_organization();
-- Fix search path security issue for the trigger function
CREATE OR REPLACE FUNCTION update_staff_location_organization()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
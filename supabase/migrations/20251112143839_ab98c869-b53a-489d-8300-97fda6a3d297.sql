-- Step 1: Drop the problematic trigger first
DROP TRIGGER IF EXISTS set_updated_at_pmr ON pro_move_resources;

-- Step 2: Drop any existing status check constraints
ALTER TABLE pro_move_resources DROP CONSTRAINT IF EXISTS pro_move_resources_status_check;

-- Step 3: Update all existing rows (now without the trigger)
UPDATE pro_move_resources 
SET status = 'active', updated_at = now()
WHERE status IS NULL OR status NOT IN ('active', 'archived');

-- Step 4: Add the check constraint
ALTER TABLE pro_move_resources 
ADD CONSTRAINT pro_move_resources_status_check 
CHECK (status IN ('active', 'archived'));

-- Step 5: Create the correct trigger function
CREATE OR REPLACE FUNCTION public.update_pro_move_resources_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Step 6: Recreate the trigger with the new function
CREATE TRIGGER set_updated_at_pmr 
  BEFORE UPDATE ON pro_move_resources
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_pro_move_resources_timestamp();
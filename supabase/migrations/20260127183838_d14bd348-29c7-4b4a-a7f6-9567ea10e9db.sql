-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Office managers can read staff in scoped locations" ON public.staff;

-- Recreate the policy using the SECURITY DEFINER function (already created)
CREATE POLICY "Office managers can read staff in scoped locations"
  ON public.staff FOR SELECT
  USING (
    public.is_office_manager_for_location(primary_location_id)
  );
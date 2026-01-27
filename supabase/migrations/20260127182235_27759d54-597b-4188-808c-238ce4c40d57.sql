-- Allow Office Managers to read staff in their scoped locations
-- This enables the LocationSubmissionWidget to work for Office Managers
CREATE POLICY "Office managers can read staff in scoped locations"
  ON public.staff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      JOIN public.coach_scopes cs ON cs.staff_id = s.id
      WHERE s.user_id = auth.uid()
        AND s.is_office_manager = true
        AND cs.scope_type = 'location'
        AND cs.scope_id = staff.primary_location_id
    )
  );
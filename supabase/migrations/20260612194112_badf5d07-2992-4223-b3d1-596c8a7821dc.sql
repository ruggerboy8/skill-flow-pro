
-- Add edit attribution + presence columns
ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

ALTER TABLE public.coaching_meeting_records
  ADD COLUMN IF NOT EXISTS last_edited_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_by_staff_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

-- Allow any in-org clinical director (and super admins) to update coaching sessions / selections / meeting records.
-- Keeps existing owner ("Coach can manage own sessions") policy intact.

DROP POLICY IF EXISTS "Clinical staff can update sessions in own org" ON public.coaching_sessions;
CREATE POLICY "Clinical staff can update sessions in own org"
ON public.coaching_sessions
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND org_id_of_staff(doctor_staff_id) = current_user_org_id()
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND org_id_of_staff(doctor_staff_id) = current_user_org_id()
  )
);

DROP POLICY IF EXISTS "Clinical staff can manage selections in own org" ON public.coaching_session_selections;
CREATE POLICY "Clinical staff can manage selections in own org"
ON public.coaching_session_selections
FOR ALL
USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND session_id IN (
      SELECT cs.id FROM coaching_sessions cs
      WHERE org_id_of_staff(cs.doctor_staff_id) = current_user_org_id()
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND session_id IN (
      SELECT cs.id FROM coaching_sessions cs
      WHERE org_id_of_staff(cs.doctor_staff_id) = current_user_org_id()
    )
  )
);

DROP POLICY IF EXISTS "Clinical staff can manage meeting records in own org" ON public.coaching_meeting_records;
CREATE POLICY "Clinical staff can manage meeting records in own org"
ON public.coaching_meeting_records
FOR ALL
USING (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND session_id IN (
      SELECT cs.id FROM coaching_sessions cs
      WHERE org_id_of_staff(cs.doctor_staff_id) = current_user_org_id()
    )
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    EXISTS (SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_clinical_director = true)
    AND session_id IN (
      SELECT cs.id FROM coaching_sessions cs
      WHERE org_id_of_staff(cs.doctor_staff_id) = current_user_org_id()
    )
  )
);

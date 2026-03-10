
-- Allow doctors to update their session when status is 'scheduling_invite_sent'
-- (so they can submit prep after receiving the scheduling invite)
DROP POLICY IF EXISTS "Doctor can update prep" ON public.coaching_sessions;

CREATE POLICY "Doctor can update prep"
ON public.coaching_sessions
FOR UPDATE
TO public
USING (
  (doctor_staff_id IN (SELECT staff.id FROM staff WHERE staff.user_id = auth.uid()))
  AND (status = ANY (ARRAY['director_prep_ready'::text, 'scheduling_invite_sent'::text, 'doctor_prep_submitted'::text, 'meeting_pending'::text]))
)
WITH CHECK (
  doctor_staff_id IN (SELECT staff.id FROM staff WHERE staff.user_id = auth.uid())
);

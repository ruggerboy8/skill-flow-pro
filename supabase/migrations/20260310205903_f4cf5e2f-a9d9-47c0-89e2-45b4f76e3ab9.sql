
-- Allow doctors to insert selections when session is in scheduling_invite_sent status
DROP POLICY IF EXISTS "Doctor can insert own selections" ON public.coaching_session_selections;

CREATE POLICY "Doctor can insert own selections"
ON public.coaching_session_selections
FOR INSERT
TO public
WITH CHECK (
  (selected_by = 'doctor'::text)
  AND (session_id IN (
    SELECT coaching_sessions.id
    FROM coaching_sessions
    WHERE coaching_sessions.doctor_staff_id IN (
      SELECT staff.id FROM staff WHERE staff.user_id = auth.uid()
    )
    AND coaching_sessions.status IN ('director_prep_ready', 'scheduling_invite_sent')
  ))
);

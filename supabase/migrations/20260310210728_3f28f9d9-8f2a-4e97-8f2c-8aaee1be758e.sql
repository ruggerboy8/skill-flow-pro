-- Allow doctors to read their coach's staff record (name, scheduling_link)
CREATE POLICY "Doctor can read own coach"
ON public.staff
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT cs.coach_staff_id
    FROM coaching_sessions cs
    WHERE cs.doctor_staff_id IN (
      SELECT s.id FROM staff s WHERE s.user_id = auth.uid()
    )
  )
);
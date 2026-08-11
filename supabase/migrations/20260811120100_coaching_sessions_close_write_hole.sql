-- "Coach can manage own sessions" was FOR ALL with WITH CHECK left null,
-- which defaults WITH CHECK to the USING clause: coach_staff_id = self.
-- Any authenticated staff row could INSERT a coaching_sessions row for any
-- doctor in any org by naming themselves coach. Tighten WITH CHECK to
-- require the same eligibility the app UI already assumes: super admin,
-- clinical director in the doctor's org, or an assigned doctor coach for
-- that specific doctor.
drop policy if exists "Coach can manage own sessions" on coaching_sessions;
create policy "Coach can manage own sessions" on coaching_sessions
for all
using (coach_staff_id in (select id from staff where user_id = auth.uid()))
with check (
  coach_staff_id in (select id from staff where user_id = auth.uid())
  and (
    is_super_admin(auth.uid())
    or (
      exists (select 1 from staff s
              where s.user_id = auth.uid() and s.is_clinical_director = true)
      and org_id_of_staff(doctor_staff_id) = current_user_org_id()
    )
    or is_assigned_doctor_coach(auth.uid(), doctor_staff_id)
  )
);

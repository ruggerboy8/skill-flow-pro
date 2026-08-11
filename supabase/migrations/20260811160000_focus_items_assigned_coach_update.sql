-- Fable review pass: an assigned doctor coach could SELECT focus items on
-- their mentee but could only UPDATE rows where they were the
-- coach_staff_id. A regional coach retiring/editing a Focus Move that a
-- clinical director created for their own mentee silently no-oped (RLS
-- filtered the row; PostgREST returned success with zero rows; the UI
-- toasted success). Focus Moves are co-owned per the product model, so
-- assigned coaches may update items for their assigned doctors.
drop policy if exists "Assigned doctor coach updates focus items" on doctor_focus_items;
create policy "Assigned doctor coach updates focus items" on doctor_focus_items
for update
using (is_assigned_doctor_coach(auth.uid(), doctor_staff_id))
with check (is_assigned_doctor_coach(auth.uid(), doctor_staff_id));

Approved scope, re-issued for confirmation:

## 1. Retire deferred baseline release
- `InviteDoctorDialog.tsx`: remove `releaseBaseline` toggle; always send `release_baseline: true`; show inline notice "Sending this invitation opens Dr. \{name\}'s baseline self-assessment so they can begin right away."
- `DoctorDetailOverview.tsx`: delete the Release Baseline card + `releaseMutation`; remove usage from `DoctorDetail.tsx`.
- `admin-users` edge function: no change (already handles release).
- Keep `baseline_released_at` / `baseline_released_by` columns as audit fields.

## 2. Fix stale visibility (no hard reload)
- `DoctorManagement.tsx` and `ClinicalHome.tsx`: set `refetchOnMount: 'always'` and `staleTime: 0` on `['doctors-management']` / `['doctor-stats']` queries.
- Add a `postgres_changes` realtime subscription on `public.staff` (filter `is_doctor=eq.true`) in `DoctorManagement.tsx`, invalidating those queries on any event.
- Empty state: when filters hide all rows but the unfiltered list is non-empty, show "No doctors match this filter — Show all doctors" reset.

## 3. Doctor name cleanup — leading "Dr." / "Doctor" only
**Migration:**
- `normalize_doctor_name()` trigger function + `BEFORE INSERT OR UPDATE OF name, is_doctor` trigger on `public.staff`. Strips a single leading `Dr.?` / `Doctor.?` token (case-insensitive) when `is_doctor = true`.
- One-time UPDATE cleaning the 6 existing rows (Ayah, Britta, Eduardo, Helen, Ian, Kaitlin).

**Client normalization:** `src/lib/doctorDisplayName.ts` gains `normalizeDoctorName(name)`; called from `InviteDoctorDialog.tsx`, `EditUserDrawer.tsx`, and the profile edit path in `Profile.tsx` before writes.

**Trailing credentials (", DDS" / ", MD"):** not touched — user's call.

## Verification
- Invite a new doctor named "Dr. Test" → stored as "Test", renders as "Dr. Test".
- Kasey sees new/updated doctors in `/clinical` within seconds without a reload.
- Filter that hides all doctors shows a reset affordance.

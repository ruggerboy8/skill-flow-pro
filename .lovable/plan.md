## Goal

Make `is_doctor` an **additive** capability so a user can be both a Regional Manager (admin) and a Doctor without losing access to either experience. Then flip the flag on Kasey Stark and set her role to Doctor (role_id = 4).

## Approach

Today `isDoctor` is treated as mutually exclusive with admin/coach navigation in three places: `Index.tsx` redirects, `Layout.tsx` nav, `useUserRole.homeRoute`. The pattern we want already exists for Clinical Director (admin nav + extra "Clinical" link). We extend that pattern so a doctor-who-is-also-admin keeps the admin nav and gets an additional "Doctor" link.

Pure doctors (no admin/coach flags) are unaffected — they keep the doctor-only experience exactly as it is today.

## Changes

### 1. Routing precedence — `src/pages/Index.tsx`

Reorder the redirect logic so admin/regional wins over doctor:

```
if (showRegionalDashboard || isOrgAdmin || isSuperAdmin) → render RegionalDashboard
else if (isDoctor) → <Navigate to="/doctor" />
else → participant home
```

Pure doctors still auto-route to `/doctor`. Kasey lands on the Command Center.

### 2. Home route — `src/hooks/useUserRole.tsx`

Update `homeRoute` precedence to match:
- super admin / org admin / regional → `/dashboard`
- pure doctor → `/doctor`
- participant → `/`

Also fix `showRegionalDashboard` to no longer exclude doctors (`!isParticipant && (isRegional || isCoach)`).

### 3. Sidebar nav — `src/components/Layout.tsx`

Replace the top-level `isDoctor ? [doctor-only nav] : ...` ternary with:
- **Pure doctor** (isDoctor && !isOrgAdmin && !isSuperAdmin && !isCoach) → existing doctor-only nav (unchanged)
- **Admin/coach who is also a doctor** → existing standard/super-admin nav PLUS a new `{ name: 'Doctor', href: '/doctor', icon: Stethoscope }` item, placed near the Clinical link

Same pattern as the existing conditional Clinical link for clinical directors.

### 4. EditUserDrawer — `src/components/admin/EditUserDrawer.tsx`

Add a "Doctor portal access" toggle (Switch component, mirroring the existing Pause Account / Backfill switches). Independent of the role preset. Defaults to current `is_doctor` value. On submit, send `is_doctor` in the payload.

### 5. admin-users edge function — `supabase/functions/admin-users/index.ts`

In the `role_preset` action handler, accept an optional top-level `is_doctor` field. Apply it to the staff update **independently of the preset's flag map**, so toggling the doctor switch doesn't get clobbered by the preset and the preset doesn't get clobbered by the toggle. (The existing `doctor` preset stays as-is for net-new doctor invites — separate code path.)

### 6. Apply changes to Kasey (data update)

After the UI ships, run a one-time update via the insert tool (Lovable Cloud → Add data):

```sql
UPDATE staff
SET is_doctor = true,
    role_id = 4
WHERE id = '9b05bd32-4a4a-41b9-8f7b-ed86be9bc50c';
```

Leaves `is_org_admin`, `is_coach`, `home_route='/dashboard'`, `organization_id`, and `primary_location_id` untouched.

## What Kasey will experience after the change

- Lands on Command Center (`/dashboard`) on login. All admin/coach/builder/evaluations nav intact.
- New **"Doctor"** item in her sidebar → opens `/doctor` Doctor Home with the baseline welcome CTA.
- Once her clinical director releases her baseline, she completes the full doctor flow (baseline wizard → results → coaching prep → schedule → meeting confirmation) just like Sage, Justin, Henry, Ana.
- `/doctor/my-role` will load Doctor competencies/ProMoves because `role_id = 4`.

## What the clinical director will experience

- Kasey appears in `/clinical` stats ("Total Doctors" +1) in the **Invited** bucket.
- Kasey appears in `/clinical/doctors` table as `Dr. Kasey Stark` / Lake Orion / Stage: Invited / Next Step: "Release the baseline when ready for the doctor to begin".
- `/clinical/doctors/{kasey-id}` opens her full doctor profile with the standard release-baseline → coach-baseline → build-prep → invite-to-schedule → meeting → follow-up workflow.

## What stays unchanged

- Pure doctors (the existing Alcan + Sprout doctors) — same experience, same nav, same routing.
- All existing RLS policies — no migration needed (`staff.is_doctor` already exists; doctor-side RLS keys off identity match + flag, both of which Kasey will satisfy).
- Her admin powers, scopes, location, and organization.
- `useStaffProfile` resolution (the "is_org_admin record wins" rule still works because she has only one staff row).

## Out of scope

- Restructuring `useStaffProfile` to handle multi-staff-row users (not needed — one row covers her).
- Any changes to the doctor invitation edge function (she's already a user; we're just turning on her doctor capability).

Approve and I'll implement, ship the UI changes first, then run the data update for Kasey.
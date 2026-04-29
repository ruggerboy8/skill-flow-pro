## Goal

Let Kasey Stark be **both** a participating doctor (just like Sage, Henry, etc.) **and** a Clinical Director (just like Dr. Alex) — managing her own roster of Michigan doctors. No disruption to the doctor experience we just shipped.

## Good news: very little new code needed

The hard work was done in the last change. Kasey already has all the doctor plumbing turned on (`is_doctor=true`, `role_id=4`), and her admin/coach navigation already coexists with a "Doctor" sidebar link. The only missing capability is the **Clinical Director** flag, which gates:

- The "Clinical" sidebar link (`Layout.tsx` checks `staffProfile.is_clinical_director`)
- Access to `/clinical/*` routes (`ClinicalLayout` uses `canAccessClinical = isClinicalDirector || isSuperAdmin`)
- Visibility of all coach baseline assessments / coaching sessions / meeting records (RLS policies key off `is_clinical_director`)
- The "Invite Doctor" button and doctor management table

Dr. Alex has exactly this combination today (`is_clinical_director + is_org_admin + is_coach`), so we know it works.

## What changes

### 1. Data update (Kasey only) — no code

Flip a single flag on her staff record:

```sql
UPDATE staff
SET is_clinical_director = true
WHERE id = '9b05bd32-4a4a-41b9-8f7b-ed86be9bc50c';
```

Everything else (`is_doctor=true`, `is_org_admin=true`, `is_coach=true`, `role_id=4`, `organization_id`, `primary_location_id`) stays exactly as it is.

### 2. Admin UI — add a "Clinical Director" toggle to EditUserDrawer

Right now the only way to grant CD access is the `clinical_director` role preset, which **forces `is_doctor=false`** (would wipe out Kasey's doctor capability). We need a manual toggle, mirroring the "Doctor Portal Access" switch we just added.

- `src/components/admin/EditUserDrawer.tsx`: add a "Clinical Director access" Switch, defaulted to current `is_clinical_director`. On submit, send it as a top-level `is_clinical_director` field (same pattern as `is_doctor`).
- `supabase/functions/admin-users/index.ts`: in the `role_preset` handler, accept and apply optional top-level `is_clinical_director` independently of the preset's flag map (same pattern we used for `is_doctor`).

This means an admin can give any user the CD capability without touching their other flags — no more all-or-nothing preset.

## What Kasey will experience

Sidebar (in order): Home → Dashboard → Builder → Coach → Evaluations → Stats → **Clinical** → **Doctor** → Admin.

- **Doctor link** (`/doctor`) — full participating-doctor experience: baseline welcome → wizard → results → coaching prep → schedule → meeting confirmation. Dr. Alex (or Ariyana) coaches her exactly like Sage or Henry.
- **Clinical link** (`/clinical`) — her own Clinical Director Portal: invite doctors, see the doctor table, release baselines, build prep, run sessions for her Michigan doctors.
- Lands on Command Center (`/dashboard`) on login as before.

## What Dr. Alex will experience

- Kasey continues to appear in his `/clinical/doctors` table as `Dr. Kasey Stark` so he can coach her.
- New caveat: Kasey will also appear in **her own** `/clinical/doctors` table (the doctor list is global today — we explicitly chose not to silo). Dr. Alex sees Kasey; Kasey sees herself plus everyone else. This matches the brief: "for now let's not worry about siloing doctors."

## What stays unchanged

- All other doctors, admins, coaches, and clinical directors — same experience.
- Dr. Alex's record — untouched.
- The `clinical_director` role preset stays as-is for net-new CD invites who aren't also doctors.
- All RLS policies — no migration needed; `is_clinical_director` already drives them.
- Routing precedence (admin > doctor) we just shipped.

## Out of scope (note for later)

- **Siloing doctors per CD.** Today every CD sees every doctor in the org. When you're ready, we can add a `clinical_director_assignments` table (or reuse `coach_scopes`) so each CD only sees doctors they own. Flag it for a future round.
- **Hiding self from your own doctor table.** Minor cosmetic — Kasey will see her own row in `/clinical/doctors`. We could add a "you" badge or hide self, but it's not blocking.

## Files to change

1. `src/components/admin/EditUserDrawer.tsx` — add Clinical Director access switch
2. `supabase/functions/admin-users/index.ts` — accept optional `is_clinical_director` in role_preset action
3. Data update on `staff` row `9b05bd32-...` — flip `is_clinical_director` to true

Approve and I'll ship the UI/edge-function changes, then run the one-line update for Kasey.

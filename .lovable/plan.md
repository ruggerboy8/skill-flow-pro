

## Phase 2 — Notification and Handoff Loop

Phase 2 adds four features: auto-release on invite, baseline release notification, a "Notify Doctor" handoff step, carrying prior action steps into follow-up prep, and persisting "Current Focus" on the doctor home. Here's the implementation plan:

---

### 1. Auto-release baseline on invite (R1.1)

**InviteDoctorDialog.tsx:**
- Add a `Switch` toggle: "Release baseline immediately" (default: on)
- Pass `release_baseline: true/false` in the `invite_doctor` request body

**admin-users edge function (`invite_doctor` case):**
- If `release_baseline` is truthy, after creating the staff row, set `baseline_released_at = now()` and `baseline_released_by = caller user_id` on the new staff record
- No separate email needed here — the existing Supabase invite email serves as the welcome; the baseline CTA will be visible when they log in

**Scope:** 2 files (dialog + edge function). Requires edge function redeployment.

---

### 2. Email notification on baseline release (R1.2)

**coach-remind edge function:**
- The current function is hardcoded to `template_key: 'confidence' | 'performance'`. Expand the `RequestPayload` type to accept `'baseline_release'` as a template key
- The function already handles arbitrary subject/body with merge tags — no structural changes needed, just widen the type

**DoctorDetailOverview.tsx (releaseMutation):**
- After successfully setting `baseline_released_at`, invoke `coach-remind` with:
  - `template_key: 'baseline_release'`
  - Subject: "Your baseline self-assessment is ready"
  - Body with `{{first_name}}` merge tag + a brief explanation
  - Recipient: the doctor's `user_id`, `email`, `name`

**Scope:** 2 files (overview component + edge function). Edge function redeployment.

---

### 3. "Notify Doctor" prep note dialog (R1.4)

**New component: `NotifyDoctorDialog.tsx`**
- Props: `open`, `onOpenChange`, `doctorName`, `doctorEmail`, `doctorStaffId`, `doctorUserId`, `onSuccess`
- Fields:
  - Personal note textarea (pre-filled with a default template)
  - Optional Calendly URL input (just a paste field, no API integration)
- On send:
  - Invoke `coach-remind` with `template_key: 'doctor_prep_note'`, subject, body (with the personal note + optional Calendly link)
  - Show toast on success

**DoctorDetailOverview.tsx:**
- Add a "Notify Doctor" action card that appears when `baseline?.status === 'completed'` and there's no active session yet (similar positioning to the "Build Prep" card)
- Opens `NotifyDoctorDialog`

**coach-remind edge function:**
- Add `'doctor_prep_note'` to the accepted template keys (same widening as R1.2)

**Scope:** 1 new component, 1 edited component, edge function already widened in R1.2.

---

### 4. Carry previous action steps into follow-up prep (R3.1)

**DirectorPrepComposer.tsx already fetches `priorExperiments`** (lines 211-235) and renders them (lines 435-453). The data fetching and display are already implemented.

**Enhancement needed:**
- Add status tagging to each prior experiment: checkboxes/pills for "✓ Addressed", "→ Continuing", "✗ Dropped"
- Store the tagged statuses: add a `prior_action_status` JSONB column to `coaching_meeting_records`
- On publish, save the prior action statuses alongside the prep

**Database migration:**
- `ALTER TABLE coaching_meeting_records ADD COLUMN prior_action_status JSONB DEFAULT '[]'::jsonb;`

**DirectorPrepComposer.tsx:**
- Add local state `priorActionStatuses: Record<number, 'addressed' | 'continuing' | 'dropped'>`
- Render status toggle buttons next to each prior experiment
- Include `prior_action_status` in the save/publish mutations

**Scope:** 1 migration, 1 component edit. The prior experiments query already works.

---

### 5. Persist "Current Focus" on doctor home (R3.4)

**Current behavior** (`DoctorHome.tsx` line 293): Only shows action steps from the single latest `doctor_confirmed` session.

**Change:**
- Instead of `sessions?.find(s => s.status === 'doctor_confirmed')`, collect ALL confirmed sessions that don't have a subsequent confirmed session (i.e., their action steps haven't been superseded)
- Simpler approach: fetch `coaching_meeting_records` for ALL confirmed sessions where the doctor has no newer completed follow-up, and aggregate their experiments
- Show them in the `CurrentFocusCard` grouped by session date

**DoctorHome.tsx:**
- Change `latestConfirmed` to `confirmedSessionIds` — all sessions with `status === 'doctor_confirmed'` or `status === 'meeting_pending'` (since R1.5 softened this)
- Update `CurrentFocusCard` to accept multiple session IDs and fetch/display action steps from all of them
- Add session date headers to group action steps

**Scope:** 1 file edit (DoctorHome.tsx).

---

### Technical Summary

| Item | Files | Schema | Edge Functions |
|------|-------|--------|----------------|
| R1.1 Auto-release | `InviteDoctorDialog.tsx`, `admin-users` | None | Redeploy |
| R1.2 Baseline email | `DoctorDetailOverview.tsx`, `coach-remind` | None | Redeploy |
| R1.4 Notify Doctor | New `NotifyDoctorDialog.tsx`, `DoctorDetailOverview.tsx` | None | Same deploy |
| R3.1 Prior actions | `DirectorPrepComposer.tsx` | 1 migration (`prior_action_status`) | None |
| R3.4 Persist focus | `DoctorHome.tsx` | None | None |

**Order of implementation:** R1.1 → R1.2 → R1.4 → R3.4 → R3.1 (migration last to minimize risk)


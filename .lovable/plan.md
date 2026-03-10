

## Phase 1 — Structural Fixes: Implementation Plan

Your gap analysis is sharp and the phasing is well-considered. Phase 1 is entirely UI/flow work with no schema changes — exactly the right place to start. Here's the implementation breakdown:

### 1. Collapse ClinicalHome into DoctorManagement (R2.1)

- Move the 4 stat cards from `ClinicalHome.tsx` into the top of `DoctorManagement.tsx`
- Update routing in `App.tsx`: change `/clinical` index route from `ClinicalHome` to `DoctorManagement`, remove the separate `/clinical/doctors` route (or redirect it to `/clinical`)
- Delete or deprecate `ClinicalHome.tsx`
- Update sidebar/nav links that point to `/clinical/doctors` to point to `/clinical`

### 2. Redesign DoctorDetail as single scrollable page (R2.3)

- Remove the `Tabs` / `TabsList` / `TabsContent` structure from `DoctorDetail.tsx`
- Replace with a vertical layout:
  - **Header**: doctor name, status pill, location (keep as-is)
  - **Next Action Card**: `DoctorNextActionPanel` (keep as-is, always visible)
  - **Overview actions**: inline the key action cards from `DoctorDetailOverview` (release baseline, build prep, invite to schedule)
  - **Coaching Thread**: render `DoctorDetailThread` directly below
  - **Baseline section**: render `DoctorDetailBaseline` inside a `Collapsible` component with a trigger header, so it's accessible but not dominant

### 3. Move CoachBaselineWizard to a Sheet (R2.4)

- In `DoctorDetail.tsx`, replace the full-page conditional render (`if (showCoachWizard) return <CoachBaselineWizard />`) with a `Sheet` (side="right", full width on mobile)
- The wizard component itself stays the same; it just renders inside a `SheetContent` with `className="sm:max-w-2xl w-full overflow-y-auto"`
- Pass `onBack` as the sheet's `onOpenChange` handler

### 4. Soften doctor confirmation (R1.5)

- In `doctorStatus.ts`: change `meeting_pending` to show a softer label like "Summary Shared" instead of "Awaiting Doctor Sign-off"; update `nextAction` to "Doctor can review the summary. You can schedule the next session."
- Remove the `doctor_revision_requested` case from `getDoctorJourneyStatus` (or map it to the same soft status)
- In `DoctorDetailOverview.tsx`: allow the "Schedule Follow-up" / "Build Prep" action to appear even when the latest session is in `meeting_pending` status
- In `MeetingConfirmationCard.tsx`: keep the doctor's confirm button but change the copy to "Acknowledge" and don't block CD-side progression

### 5. Remove coach baseline scheduling gate (R1.3)

- In `doctorStatus.ts`: remove the `director_baseline_pending` blocking logic (lines 120-129). When doctor baseline is completed but coach baseline isn't, show `baseline_submitted` or `ready_for_prep` instead, with a soft nudge like "Tip: Complete your private assessment before the meeting"
- In `DoctorDetailOverview.tsx`: remove any `canSchedule` gating based on coach baseline status; show the prep/schedule actions regardless
- Keep a non-blocking info banner: "You haven't completed your private assessment yet" — but don't hide action buttons

### Technical Notes

- No database migrations needed
- No edge function changes
- All changes are in ~6 files: `App.tsx` (routing), `DoctorDetail.tsx`, `DoctorDetailOverview.tsx`, `DoctorManagement.tsx`, `doctorStatus.ts`, `ClinicalHome.tsx` (delete/deprecate)
- The `Collapsible` component from Radix is already installed and exported
- The `Sheet` component is already available and used elsewhere


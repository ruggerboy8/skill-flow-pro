

# Fix Clinical Director Portal: 6 Issues

## Issue 1: Auto-create Baseline Review session on release

Currently, the coaching thread shows "No coaching sessions yet" until the director manually creates one. The "Notify Doctor" card in `DoctorDetailOverview` is a separate action outside the thread.

**Changes:**
- **`DoctorDetailOverview.tsx`**: In the `releaseMutation.onSuccess`, after releasing the baseline, also auto-insert a `coaching_sessions` row with `session_type: 'baseline_review'`, `sequence_number: 1`, `status: 'scheduled'`. Remove the "Notify Doctor" card entirely — that action will move into the thread.
- **`DoctorDetailThread.tsx`**: When a baseline_review session exists at status `scheduled`, the existing "Build Agenda" button already appears. The "Add Coaching Session" button should appear above it (it already does when `sessions.length > 0`). This means the thread becomes the single hub immediately after release.
- Remove the `showNotify` logic and `NotifyDoctorDialog` import from `DoctorDetailOverview` (the prep note can be sent from the scheduling invite flow instead).

## Issue 2: Coach baseline wizard accessible from thread

Currently the private coach baseline wizard is buried under the collapsible "Baseline Assessment" section at the bottom.

**Changes:**
- **`DoctorDetail.tsx`**: Pass `coachAssessment` and `onStartCoachWizard` to `DoctorDetailThread` as new props.
- **`DoctorDetailThread.tsx`**: Add a compact card above the session list (or below the "Add Session" button) showing the coach's private baseline status with a button to open the wizard. Only show when the doctor's baseline is complete and there are sessions. Something like: "Your Private Assessment: [Not Started / In Progress / Complete] → [Start / Continue / View]".

## Issue 3: Coach baseline wizard renders in half-screen Sheet

The wizard is opened via a `Sheet` with `side="right"` and `sm:max-w-2xl` — this makes it a narrow side panel, which is cramped for a full assessment wizard.

**Changes:**
- **`DoctorDetail.tsx`**: Replace the `Sheet/SheetContent` wrapper with a conditional render. When `showCoachWizard` is true, render `CoachBaselineWizard` as a full-page overlay (similar to how `DirectorPrepComposer` replaces the thread view). This gives the wizard the full viewport.

## Issue 4: "Stop & Transcribe" button unclickable

The button is at line 648 of `CoachBaselineWizard.tsx`, inside a `div` at the very bottom of the scrollable content. In the Sheet (half-screen), it's likely clipped or below the fold. Since Issue 3 converts to full-page, this should be resolved. However, there's also a structural fix needed:

**Changes:**
- **`CoachBaselineWizard.tsx`**: Move the "Stop & Transcribe" and processing controls into a **sticky footer** (`sticky bottom-0`) so they're always visible when recording, regardless of scroll position. This is critical because the user scrolls through domains while recording.

## Issue 5: Next action text mismatch in portal

Looking at `doctorStatus.ts`, the `nextAction` strings are coach-oriented but some are wrong for the current stage context:

- `doctor_confirmed` → nextAction says "Schedule a follow-up to check on progress" — this is correct for the portal
- `ready_for_prep` → says "Build your meeting agenda before inviting to schedule" — correct
- `scheduling_invite_sent` → says "Waiting for doctor to schedule via the link you sent" — correct
- `baseline_submitted` → says "Review baseline results" — should say "Complete your private assessment and build meeting agenda"
- `invited` → says "Release the baseline when ready for the doctor to begin" — correct

**Changes:**
- **`doctorStatus.ts`**: Update `nextAction` for `baseline_submitted` to "Complete your private assessment, then build the meeting agenda" and for `ready_for_prep` (with nudge) to "Open the coaching thread to build your meeting agenda".
- **`DoctorManagement.tsx` `InlineAction`**: Add cases for `scheduling_invite_sent` ("View Details") and `meeting_ready` ("Start Meeting") stages.

## Issue 6: Doctor baseline tutorial didn't auto-play

The tutorial triggers when `currentStep === 'assessment'` and `localStorage.getItem('baseline-tutorial-seen')` is falsy. If the user has previously visited (even on a different account), the localStorage flag persists.

**Changes:**
- **`BaselineWizard.tsx`**: Make the localStorage key account-specific: `baseline-tutorial-seen-${staff?.id}` instead of the generic `baseline-tutorial-seen`. This ensures each doctor sees the tutorial on their first visit. Also update `handleTutorialComplete` to use the same key.

## Files to modify:
1. `src/components/clinical/DoctorDetailOverview.tsx` — auto-create session on release, remove notify card
2. `src/components/clinical/DoctorDetailThread.tsx` — add coach baseline status card
3. `src/pages/clinical/DoctorDetail.tsx` — replace Sheet with full-page render for wizard
4. `src/components/clinical/CoachBaselineWizard.tsx` — sticky footer for recording controls
5. `src/lib/doctorStatus.ts` — fix nextAction text
6. `src/pages/clinical/DoctorManagement.tsx` — add missing InlineAction cases
7. `src/pages/doctor/BaselineWizard.tsx` — account-specific tutorial localStorage key



## Fix HTML Formatting + Post-Submission Summary View

### Problem 1: Bullets and Headings Not Rendering

The `@tailwindcss/typography` plugin is installed as a dependency but **not included** in `tailwind.config.ts` plugins array. This means `prose prose-sm` classes on the agenda HTML have no effect -- bullets, headings, and indentation are all ignored.

**Fix:** Add `require("@tailwindcss/typography")` to the plugins array in `tailwind.config.ts`.

### Problem 2: Clinical Director Can't See Doctor's Submitted Prep

After the doctor submits their prep, the clinical director still sees the "View / Edit Prep" button which opens the editable `DirectorPrepComposer`. Instead, once the doctor has submitted (`doctor_prep_submitted` status), the director should:

- No longer be able to edit their prep
- See a read-only **Combined Prep Summary** showing the agenda, coach's selected Pro Moves, doctor's selected Pro Moves, and the doctor's notes/questions

**Fix in `DoctorDetailOverview.tsx`:**
- When clicking "View / Edit Prep" on a session with status `doctor_prep_submitted`, show the `CombinedPrepView` inline instead of opening `DirectorPrepComposer`
- Change the button label from "View / Edit Prep" to just "View Prep" when status is `doctor_prep_submitted`
- Keep "View / Edit Prep" label and composer behavior only for `director_prep_ready` status (doctor hasn't responded yet)

### Technical Changes

**File: `tailwind.config.ts`**
- Line 138: Change `plugins: [require("tailwindcss-animate")]` to `plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")]`

**File: `src/components/clinical/DoctorDetailOverview.tsx`**
- Add a state variable like `showPrepSummary` for inline combined view
- When `viewablePrepSession.status === 'doctor_prep_submitted'`, the button says "View Prep Summary" and toggles an inline `CombinedPrepView` rather than opening the composer
- When status is `director_prep_ready`, keep current behavior (opens composer for editing)
- The `CombinedPrepView` is already being rendered below, so adjust the button to scroll to it or simply ensure it's prominent enough

**File: `src/components/clinical/DirectorPrepComposer.tsx`**
- Add a read-only guard: if the session status is `doctor_prep_submitted` or later, redirect back via `onBack()` (defensive, since the overview should no longer open it in this state)

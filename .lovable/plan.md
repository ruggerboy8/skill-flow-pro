

## Doctor Onboarding Flow Adjustments

### Overview
Two changes: (1) Replace the auto-baseline prompt on the Doctor Home page with a friendly welcome message that encourages exploration, and (2) add a learning materials drawer to each pro move card in the "My Team" tab.

---

### 1. Doctor Home -- Welcome Message (no baseline auto-prompt)

**File: `src/pages/doctor/DoctorHome.tsx`**

Currently, when no baseline exists or it hasn't been started, the Home page shows a "Complete Your Baseline" / "Start Baseline Assessment" card linking to `/doctor/baseline`. This will be replaced with a welcoming card:

- Title: "Welcome, [Name]"
- Body: Friendly message explaining that their baseline self-assessment will be initiated by their clinical director when the time comes. In the meantime, they're encouraged to explore "My Role" (to see Doctor Pro Moves) and "My Team" (to see their team's weekly Pro Moves).
- Include navigation links/buttons to `/doctor/my-role` and `/doctor/my-team`.
- Remove the "in_progress" auto-resume card as well -- the baseline should only be accessible once the clinical director initiates it (or we can keep the resume card if they've already started; depends on your preference, but the default fallback will no longer push them to start).

The existing cards for active coaching sessions (prep, meetings, etc.) remain unchanged.

### 2. Learning Materials Drawer in "My Team" Tab

**File: `src/components/doctor/TeamWeeklyFocus.tsx`**

Each `AssignmentCard` currently shows the pro move name and domain color strip. We will:

- Add a `GraduationCap` icon button on the right side of each card.
- Clicking it opens the `LearnerLearnDrawer` (from `src/components/learner/LearnerLearnDrawer.tsx`), which is the standard learning materials sheet used by staff. It fetches description, video, script, audio, and links for the given `action_id`.
- Track the currently-open `action_id` via state in the parent `TeamWeeklyFocus` component and pass it down.
- The drawer will show in read-only "Study Mode" without the "Your History" stats section (since doctors won't have personal practice history for staff pro moves). We'll pass placeholder values for `lastPracticed` and `avgConfidence` (null) so that section shows "Not yet" / "-".

---

### Technical Details

**DoctorHome.tsx changes:**
- Replace the bottom two return blocks in `renderPrimaryCTA()` (the "no baseline" and "in_progress" cases, lines ~222-260) with a single welcoming card containing:
  - Warm greeting text
  - Two `Link` buttons to `/doctor/my-role` and `/doctor/my-team`
- Keep all coaching-session CTAs (prep, meeting, confirmed, etc.) as-is

**TeamWeeklyFocus.tsx changes:**
- Import `LearnerLearnDrawer` and `GraduationCap` icon
- Add `useState` for `openDrawer: { actionId: number; statement: string; domain: string } | null`
- In `AssignmentCard`, add a clickable `GraduationCap` icon
- Render `LearnerLearnDrawer` once at the `TeamWeeklyFocus` level, controlled by the state


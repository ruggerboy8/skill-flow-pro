

## Phase 3 — Outcomes Depth and AI Assist

Four items: doctor progress notes on prior action steps, AI-assisted meeting summary from transcript, doctor growth timeline, and inline quick actions on the doctor list.

---

### 1. Doctor Progress Note Before Check-in (R3.2)

**DoctorReviewPrep.tsx** — Add a new "Step 0" section before the coach agenda when `session.sequence_number > 1`:

- Fetch prior session's `coaching_meeting_records.experiments` (same pattern as `DirectorPrepComposer` lines 211-235)
- Render each action step with a simple status selector: `Going well` / `Working on it` / `Haven't started` + optional short note textarea per step
- Store the progress data as JSON in the existing `coaching_sessions.doctor_note` field, structured as: `{ progress: [{title, status, note}], freeNote: "..." }` — this avoids a schema change while keeping the data queryable
- On submit, serialize both the progress array and the free-text note into `doctor_note`

**No schema changes needed.** The `doctor_note` column is already text — we'll JSON-stringify into it and parse on read in `CombinedPrepView`.

**CombinedPrepView.tsx** — Update to detect JSON in `doctor_note` and render the progress section nicely when present.

---

### 2. AI-Assisted Meeting Summary from Transcript (R3.3)

**MeetingOutcomeCapture.tsx** — Add a "Paste Transcript" toggle/tab alongside manual entry:

- New state: `transcriptMode` boolean, `rawTranscript` text, `aiProcessing` boolean
- When the CD pastes a transcript and clicks "Generate Summary":
  1. Call `format-transcript` edge function to clean the text
  2. Call `extract-insights` edge function with `source: 'observation'` to get structured output
  3. Pre-fill `summary` from `insights.summary_html` (strip HTML to plain text for the textarea)
  4. Pre-fill `experiments` from `insights.domain_insights` growth areas (map top 1-3 into action step titles)
- CD can edit all pre-filled fields before submitting
- Both edge functions already exist, are deployed, and accept the right inputs

**No schema or edge function changes needed.**

---

### 3. Doctor Growth Timeline (R3.5)

**New component: `DoctorGrowthTimeline.tsx`**

- Props: `doctorStaffId: string`
- Fetches all `coaching_sessions` for the doctor, plus `coaching_meeting_records` and `coaching_session_selections` for each
- Renders a vertical timeline:
  - Each session as a node: date, type label, status badge
  - Expanded content: selected pro moves (with domain badges), action steps, prior action statuses (addressed/continuing/dropped)
  - Domain coverage summary at the top: 4 domain pills showing how many sessions touched each domain

**DoctorDetail.tsx** — Add a collapsible "Growth Timeline" section between the Coaching Thread and Baseline sections.

**No schema changes needed.** All data already exists across `coaching_sessions`, `coaching_session_selections`, and `coaching_meeting_records`.

---

### 4. Inline Quick Actions on Doctor List (R2.2)

**DoctorManagement.tsx** — Add a contextual action button column to the table:

- Map `journeyStatus.stage` to inline buttons:
  - `invited` / `baseline_released` → no inline action (waiting on doctor)
  - `baseline_submitted` / `ready_for_prep` → "Build Prep" button → navigates to `/clinical/doctors/:id`
  - `meeting_pending` → "Schedule Next" button
  - `doctor_confirmed` → "Start Follow-up" button
- Buttons render in a new column before the overflow menu
- Each button calls `e.stopPropagation()` to prevent row navigation, then navigates to the detail page (where the action cards live)

**No schema changes needed.**

---

### Technical Summary

| Item | Files Modified | New Files | Schema | Edge Functions |
|------|---------------|-----------|--------|----------------|
| R3.2 Progress notes | `DoctorReviewPrep.tsx`, `CombinedPrepView.tsx` | None | None | None |
| R3.3 AI transcript | `MeetingOutcomeCapture.tsx` | None | None | None (existing) |
| R3.5 Growth timeline | `DoctorDetail.tsx` | `DoctorGrowthTimeline.tsx` | None | None |
| R2.2 Inline actions | `DoctorManagement.tsx` | None | None | None |

**Order:** R3.2 → R3.3 → R3.5 → R2.2

Zero schema migrations. Zero edge function changes. All four items are pure frontend work leveraging existing data and APIs.


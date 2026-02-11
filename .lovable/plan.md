

# Doctor Baseline Enhancements -- Implementation Plan

Three features added to the baseline self-assessment, built in order of complexity.

---

## Phase 1: Per-Pro-Move Notes (no migration needed)

The `self_note` column already exists on `doctor_baseline_items`. This is purely UI work.

### Changes to `DomainAssessmentStep.tsx`
- Add a `MessageSquare` icon button on each pro move row (right side, before the radio buttons or below the statement).
- Clicking toggles an inline textarea below that row (animated expand/collapse).
- Textarea value is the current `note` from `ratings[pm.action_id]?.note`.
- On blur or after 600ms debounce, call a new `onNoteChange(actionId, noteText)` callback. This is separate from `onRatingChange` to handle the case where no rating exists yet.

### Changes to `BaselineWizard.tsx`
- Add a new `saveNoteMutation` that upserts only `self_note` + `updated_at` on `doctor_baseline_items` (does not touch `self_score`). This avoids overwriting a null score.
- Pass `onNoteChange` to `DomainAssessmentStep` alongside `onRatingChange`.
- When a rating IS set and a note exists locally, continue sending both via the existing `saveRatingMutation`.

### Changes to `DoctorBaselineResults.tsx` (doctor's view)
- Update the query to include `self_note` in the select.
- Add `self_note` to the `BaselineItem` interface.
- Show a small `MessageSquare` icon on rows that have a note (`self_note?.trim()` is truthy).
- Clicking a row already opens `DoctorMaterialsSheet` -- display the note text prominently above the materials content.

### Changes to `ClinicalBaselineResults.tsx` (Alex's view)
- Update the query to include `self_note`.
- Add `self_note` to the `BaselineItem` interface.
- Show `MessageSquare` icon on noted rows.
- Add a "Show only noted" switch/toggle above the domain tabs. When ON, filter `sortedItems` to only those with `self_note?.trim()`. This filters within the current domain tab, not across domains.
- When clicking a noted row, show the note text inline or in the materials sheet.

---

## Phase 2: End-of-Assessment Reflection

### Database Migration
```sql
ALTER TABLE doctor_baseline_assessments
  ADD COLUMN reflection_original text,
  ADD COLUMN reflection_formatted text,
  ADD COLUMN reflection_mode text,
  ADD COLUMN reflection_submitted_at timestamptz;
```

No `reflection_audio_path` in v1 -- audio is ephemeral (transcript-only storage).

### New Edge Function: `format-reflection`
- Follows the same pattern as `polish-note` (Lovable AI gateway, Gemini Flash).
- System prompt enforces strict format-only constraints:
  - "Do not add new information."
  - "Do not remove any information."
  - "Do not change tone or voice."
  - "Do not paraphrase."
  - "Only fix grammar, punctuation, and formatting."
  - "If a sentence is unclear, keep wording but improve punctuation; do not reinterpret."
  - "Preserve all proper nouns and clinical terms verbatim."
  - "Output plain text only. Use bullet points if the speaker lists multiple items."
- Guardrails:
  - If output is >15% shorter than input (by character count), fall back to original.
  - If output is empty/whitespace, fall back to original.
  - If output starts with meta-commentary ("Here's", "Sure", "The cleaned"), strip first line and re-check, or fall back.
- Returns `{ formatted: string }`.

### Changes to `BaselineComplete.tsx`
- After the success checkmark and "What happens next?" section, add a "Reflection (optional)" card.
- Display the four guiding prompts as soft italic text (not form fields).
- Two-tab or two-button input mode:
  - **Type**: Textarea, character count shown.
  - **Record**: Reuse the existing `AudioRecorder` component. On recording complete, call the existing `transcribe-audio` edge function. Show the transcript in an editable textarea.
- "Submit Reflection" button calls:
  1. `format-reflection` edge function with the text.
  2. Updates `doctor_baseline_assessments` with `reflection_original`, `reflection_formatted`, `reflection_mode` ('typed' or 'voice'), and `reflection_submitted_at`.
- After submission: show formatted text (read-only) with "View original" toggle and "Edit" button.
- "Edit" re-opens the textarea with `reflection_original`, and re-runs formatting on submit.
- This section never blocks the "Go to Home" button.

### Changes to `DoctorBaselineResults.tsx`
- Fetch `reflection_original`, `reflection_formatted`, `reflection_mode`, `reflection_submitted_at` from the baseline assessment query.
- If reflection exists, show a collapsed "Reflection" section at the bottom with the formatted text and "View original" toggle.

### Changes to `ClinicalBaselineResults.tsx`
- Same as doctor view: fetch and display reflection in a collapsed section at the bottom (read-only for Alex).

---

## Phase 3: Coach Private Baseline Assessment

### Database Migration
```sql
CREATE TABLE coach_baseline_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_staff_id uuid NOT NULL REFERENCES staff(id),
  coach_staff_id uuid NOT NULL REFERENCES staff(id),
  status text DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (doctor_staff_id, coach_staff_id)
);

CREATE TABLE coach_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES coach_baseline_assessments(id) ON DELETE CASCADE,
  action_id bigint NOT NULL REFERENCES pro_moves(action_id) ON DELETE CASCADE,
  rating int CHECK (rating >= 1 AND rating <= 4),
  note_text text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (assessment_id, action_id)
);

ALTER TABLE coach_baseline_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_baseline_items ENABLE ROW LEVEL SECURITY;
```

### RLS Policies
Use a security definer function to check staff roles (avoids recursive RLS):

```sql
CREATE OR REPLACE FUNCTION public.get_staff_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM staff WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_clinical_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = _user_id
    AND (is_clinical_director = true OR is_super_admin = true)
  );
$$;

-- coach_baseline_assessments policies
CREATE POLICY "Clinical staff can read own assessments"
  ON coach_baseline_assessments FOR SELECT TO authenticated
  USING (public.is_clinical_or_admin(auth.uid()));

CREATE POLICY "Coach can insert own assessments"
  ON coach_baseline_assessments FOR INSERT TO authenticated
  WITH CHECK (
    coach_staff_id = public.get_staff_id_for_user(auth.uid())
    AND public.is_clinical_or_admin(auth.uid())
  );

CREATE POLICY "Coach can update own assessments"
  ON coach_baseline_assessments FOR UPDATE TO authenticated
  USING (
    coach_staff_id = public.get_staff_id_for_user(auth.uid())
    AND public.is_clinical_or_admin(auth.uid())
  );

-- coach_baseline_items policies (same pattern)
CREATE POLICY "Clinical staff can read own items"
  ON coach_baseline_items FOR SELECT TO authenticated
  USING (
    assessment_id IN (
      SELECT id FROM coach_baseline_assessments
      WHERE public.is_clinical_or_admin(auth.uid())
    )
  );

CREATE POLICY "Coach can insert own items"
  ON coach_baseline_items FOR INSERT TO authenticated
  WITH CHECK (
    assessment_id IN (
      SELECT id FROM coach_baseline_assessments
      WHERE coach_staff_id = public.get_staff_id_for_user(auth.uid())
    )
  );

CREATE POLICY "Coach can update own items"
  ON coach_baseline_items FOR UPDATE TO authenticated
  USING (
    assessment_id IN (
      SELECT id FROM coach_baseline_assessments
      WHERE coach_staff_id = public.get_staff_id_for_user(auth.uid())
    )
  );
```

Doctors have zero policies on these tables -- no access at all.

### New Component: `CoachBaselineWizard.tsx`
- Mirrors `BaselineWizard` but targets `coach_baseline_assessments` and `coach_baseline_items`.
- Accepts a `doctorStaffId` prop.
- Uses the same `DomainAssessmentStep` component for the rating UI.
- Coach's own notes are saved to `coach_baseline_items.note_text`.
- Accessible from DoctorDetail page.

### Changes to `DoctorDetail.tsx`
- Below the existing `ClinicalBaselineResults`, add a new card: "Your Baseline Assessment (Private)".
- Shows status: Not Started / In Progress / Complete, with "Last updated" timestamp.
- "Start Assessment" or "Continue Assessment" button opens the `CoachBaselineWizard` (can be inline or a sub-route like `/clinical/doctors/:staffId/coach-baseline`).

### Changes to `ClinicalBaselineResults.tsx`
- Add a "Show my ratings" toggle (only visible to clinical directors).
- When toggled ON, fetch `coach_baseline_items` for the current doctor + current coach.
- Each pro move row shows: `Self: 3 | You: 2` side-by-side.
- Rows where `Math.abs(selfScore - coachScore) >= 2` get a subtle amber/yellow background highlight. No "gap" label.
- Fetch is lazy (only on toggle ON) to avoid unnecessary queries.

---

## Files Summary

| File | Change |
|------|--------|
| `src/components/doctor/DomainAssessmentStep.tsx` | Inline note textarea per row |
| `src/pages/doctor/BaselineWizard.tsx` | Separate `saveNoteMutation`, pass `onNoteChange` |
| `src/pages/doctor/DoctorBaselineResults.tsx` | Include `self_note`, show indicators + reflection section |
| `src/components/clinical/ClinicalBaselineResults.tsx` | Note indicators, "Show only noted" filter, reflection section, "Show my ratings" toggle |
| `src/components/doctor/BaselineComplete.tsx` | Reflection input (type/record), submit, display |
| `src/pages/clinical/DoctorDetail.tsx` | Coach baseline status card + start/continue button |
| `src/components/clinical/CoachBaselineWizard.tsx` | New -- mirrors doctor wizard for coach tables |
| `supabase/functions/format-reflection/index.ts` | New -- LLM formatting with guardrails |
| Migration SQL | Alter `doctor_baseline_assessments` + create `coach_baseline_*` tables + RLS |


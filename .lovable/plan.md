

# Plan: Four Feature Updates

## 1. AI Transcript Mapping — Verbatim Fallback

**Problem**: When the AI doesn't understand what was said, it regurgitates the pro move statement instead of preserving the actual transcript text.

**Change**: Update `supabase/functions/map-baseline-domain-notes/index.ts` — modify the system prompt in both deterministic and fallback modes to add an explicit instruction:
- "If the transcript segment is unclear or you cannot determine specific observations, include the verbatim transcript text for that segment rather than paraphrasing or restating the Pro Move statement itself. Never restate the Pro Move's action statement as a note."

This is a prompt-only change to the edge function.

## 2. Meeting Agenda Templates (User-Specific)

**Problem**: Clinical directors need reusable agenda templates for "baseline_review" and "standard check-in" session types.

**Database**: Create a new table `coaching_agenda_templates`:
- `id` uuid PK default gen_random_uuid()
- `staff_id` uuid NOT NULL (FK concept to staff, the coach who owns it)
- `session_type` text NOT NULL ('baseline_review' or 'follow_up')
- `template_html` text NOT NULL
- `updated_at` timestamptz default now()
- `created_at` timestamptz default now()
- UNIQUE(staff_id, session_type)
- RLS: coaches can manage their own rows (staff_id matches auth.uid() via staff table)

**UI Changes in `DirectorPrepComposer.tsx`**:
- Add a query to fetch the user's template for the current session type
- Add a "Load Template" button near the Quill editor that pre-fills `coachNote` from the saved template
- Add a "Save as Template" button that upserts the current `coachNote` into `coaching_agenda_templates`
- Both buttons sit in the Meeting Agenda card header alongside "Magic Format"

## 3. Baseline Review Sort — Ascending/Descending Toggle

**Problem**: Currently clicking Self/Coach column headers only sets which column to sort by, always descending. Need asc/desc toggle.

**Changes in `ClinicalBaselineResults.tsx`**:
- Change `sortBy` state from `'self' | 'coach'` to `{ column: 'self' | 'coach'; direction: 'asc' | 'desc' }`
- Clicking the same column toggles direction; clicking a different column sets it with 'desc' default
- Update `getSortedDomainItems` to respect direction
- Show `ArrowUp` or `ArrowDown` icon based on current direction
- Apply same logic in `DirectorPrepComposer.tsx` pro move picker if needed (currently no sort headers there, so skip)

## 4. Meeting Prep ProMove Picker Filters

**Problem**: In `DirectorPrepComposer.tsx`, clinical directors need to filter pro moves by low self scores, low coach scores, and score gaps.

**Changes in `DirectorPrepComposer.tsx`**:
- Add filter state: `selfScoreFilter: Set<number>`, `coachScoreFilter: Set<number>`, `gapFilter: 'none' | 'gap1' | 'gap2'`
- Add a compact filter bar above/below the domain tabs with:
  - "Low Self (1–2)" toggle button
  - "Low Coach (1–2)" toggle button  
  - "Gap ≥1" and "Gap ≥2" toggle buttons
  - "Clear" link
- Filter logic in the domain tab rendering:
  - Low Self: `item.self_score >= 1 && item.self_score <= 2`
  - Low Coach: `coachRatingMap[id] >= 1 && coachRatingMap[id] <= 2` (exclude 0/null — 0 is N/A)
  - Gap ≥1: both scores are non-null, both > 0 (exclude N/A), and `Math.abs(self - coach) >= 1`
  - Gap ≥2: same but `>= 2`
- Critical: scores of 0 represent N/A and must be excluded from all numerical comparisons

## Files to modify:
1. `supabase/functions/map-baseline-domain-notes/index.ts` — update AI prompt
2. New migration: create `coaching_agenda_templates` table with RLS
3. `src/components/clinical/DirectorPrepComposer.tsx` — template load/save + pro move filters
4. `src/components/clinical/ClinicalBaselineResults.tsx` — asc/desc sort toggle


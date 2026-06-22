# Evaluation Flow — Deep-Dive Analysis & Redesign Direction

*Author: engineering-software-architect persona. Date: 2026-06-22. Branch `claude/security-and-baseline`.*
*Scope: READ-ONLY map of the Evaluation feature as it exists today, ranked bug/friction list,
and a redesign direction toward the owner's "single brain-dump → auto-slotted, Pro-Move-prioritized
feedback" vision. Maps to backlog items E1 and EX1–EX4.*

> This is a map, not a spec. Where it cites `file:line`, that is the source of truth; where it
> infers intent, it says so. Verify column existence against migrations before building.

---

## 0. TL;DR

The evaluation feature is a **coach-authored, competency-scored, admin-released** assessment with a
surprisingly capable AI pipeline already in place (audio → transcript → per-competency notes →
staff-facing review wizard). The pain the owner feels is **real but mostly in the seams**, not the
plumbing:

1. The atomic unit of authoring is the **competency** (126 of them), but the product's mental model
   and the desired feedback target is the **Pro Move** (332). The evaluator carries that translation
   in their head — this is the core of EX1.
2. The "one brain-dump → auto-slot" vision is **already ~70% built** via `map-observation-notes`, but
   it's gated behind a click-to-tag-each-competency interaction that reintroduces the cognitive load
   it was meant to remove.
3. The recording flow is a multi-step state machine (record → auto-save draft → transcribe → format →
   map) with several known fragilities (pause/resume corruption, segment concatenation, silent-clip
   hallucination) — EX2.
4. Delivery/release works and is org-safe, but the UI is a dense three-column grid bolted onto the
   admin "results" page, and the submit→release policy is implicit (EX3).
5. The staff-facing review (`EvaluationReview`) is actually the **most polished** surface — an 8-step
   wizard — but it depends entirely on observer *scores* being present, and degrades to "sparse" when
   the coach scored fewer than 4 competencies (EX4).

**Top recommendation:** make the **Pro Move the authoring unit**, and turn the existing
`map-observation-notes` function into the *default* path — record once, auto-slot to Pro Moves,
evaluator only reviews/corrects. Everything else is polish on top of that spine.

---

## 1. Current-state map

### 1.1 Data model

**`evaluations`** (header, ~106 rows). Origin: `20250820222724`. Key columns and how they're used:

| Column | Added in | Role |
|---|---|---|
| `staff_id, role_id, location_id, evaluator_id` | original | Who/where. `evaluator_id` = the coach. |
| `type` | `20250820223300` | `'Baseline' \| 'Midpoint' \| 'Quarterly'` (CHECK). UI only offers Baseline/Quarterly. |
| `quarter` | original (nullable since `…223300`) | `Q1–Q4`, null for Baseline. |
| `program_year` | original | Year. |
| `observed_at` | original | Coach-set observation date. |
| `status` | original | `'draft' \| 'submitted'`. This is the **authoring lifecycle**, not delivery. |
| `is_visible_to_staff` | `20260128144756` | **The delivery gate.** Defaults `false`. Staff cannot see the eval until this flips true. Partial index on `= true`. |
| `released_at / released_by` | `20260211170312` | Stamped (idempotently via `COALESCE`) when first released. `released_by → staff.id`. |
| `viewed_at` | `20260211170312` | Set once, by the staff member, via `mark_eval_viewed`. |
| `acknowledged_at` | `20260211170312` | Set when staff completes the review wizard / saves focus. |
| `focus_selected_at` | `20260211170312` | Set when staff picks their post-eval focus Pro Moves. |
| `review_payload` | `20260211170312` | **Cached, computed** JSON the staff review wizard renders from. v1 then v2 (`20260211180832`). Holds domain summaries + ranked `top_candidates`/`bottom_candidates`. Computed lazily on first staff view; version-cached. |
| `audio_recording_path` | `20251030202639` | Legacy single-file interview recording (storage bucket `evaluation-recordings`, private). |
| `draft_observation_audio_path` | (later) | Auto-saved in-progress observation recording, deleted after successful transcription. |
| `summary_raw_transcript / summary_feedback` | (later) | The observation transcript + an optional summary. |
| `interview_transcript` | (later) | **Legacy** self-assessment interview transcript. Self-scores are now derived from weekly performance, so this path is effectively retired (`isLegacyInterviewEval` in `src/lib/evaluations.ts:48`). |
| `extracted_insights` | `20251217175454` | JSONB of AI `{observer, self_assessment}` perspectives. Written by `extract-insights`; **only the batch processor and the orphaned `ObservationRecorder` still write it** (see 1.3). |
| `evaluator_note` | (later) | Free-form coach note to the staff member; shown as "Note from Coach" in the review wizard. Auto-formatted via `format-evaluator-note` on submit/release. |
| `prior_action_status` | (later) | JSONB, default `[]` — carry-forward of prior focus items' status. |

**`evaluation_items`** (line items, ~1,696 rows). Origin: `20250820222724`. PK
`(evaluation_id, competency_id)` — **keyed on competency, not Pro Move.** Columns:
`competency_id`, `competency_name_snapshot`, `domain_id`/`domain_name` (denormalized snapshot),
`observer_score` (1–4), `observer_note`, `observer_is_na`, `self_score`, `self_note`, `self_is_na`,
plus aggregated `self_score_avg`/`self_score_sample_size` (from weekly performance).

**Seeding:** `createDraftEvaluation` (`src/lib/evaluations.ts:115`) creates one item **per competency
of the staff member's role** (`competencies.role_id`). There is **no Pro-Move-level granularity in the
data model at all** — Pro Moves only enter via the staff-facing focus selection (`staff_quarter_focus`,
which references `pro_moves.action_id`).

**`staff_quarter_focus`** (`20260211170312`): post-eval focus Pro Moves the staff member selects
(max 3), validated against the competencies in their eval.

### 1.2 Authoring UI (coach-facing)

- **Entry / list:** `src/pages/coach/EvaluationHub.tsx` (~1,900 lines — a god-component) and
  `QuarterlyEvalsTab.tsx`. Draft creation in `src/lib/evaluations.ts:createDraftEvaluation`.
- **Two tabs:** *Observation* (score + note every competency, grouped by domain) and *Summary*.
  Self-assessment tab/recording was removed; self-scores now auto-aggregate from weekly performance
  (`refreshEvalSelfScores` / `compute_eval_self_scores`).
- **Scoring:** each competency row has a 1–4 score, an N/A toggle, and a collapsible note. Notes are
  **forced** for scores ≤ 2 (`isEvaluationComplete`, `evaluations.ts:601`; submit is blocked
  otherwise). Notes use a pending-buffer + onBlur/flush-on-submit pattern.
- **Competency-aware recording:** while recording, the coach **taps a competency row to "tag"** the
  current segment; taps are logged as a `competencyTimeline` of `{competency_id, t_start_ms}`
  (`EvaluationHub.tsx:279`). This timeline is passed to `map-observation-notes` as a hint.
- **Submit:** `submitEvaluation` recomputes self-scores + participation snapshot, formats the
  evaluator note, then flips `status='submitted'`. The toast explicitly tells the coach to release
  from the Delivery tab (`EvaluationHub.tsx:905`). **Submit ≠ release** by design.

### 1.3 Audio + AI pipeline

Storage bucket `evaluation-recordings` (private, coach-only RLS, `20251030202639`).

| Function | JWT | What it does | Where invoked |
|---|---|---|---|
| `transcribe-audio` | true | Whisper (≤25MB) with a dental-vocabulary prompt; **ElevenLabs Scribe fallback** for >25MB or Whisper format-rejection. Guards <3KB clips (silence → hallucination). Returns 200-with-error-body so the client sees real messages. | `EvaluationHub`, `audioChunking.ts` |
| `format-transcript` | true | Cleans the raw transcript for readability. | `EvaluationHub:442` |
| `map-observation-notes` | true | **The key function for the vision.** Splits one observation transcript into **per-competency** coaching notes (warm 2nd-person tone, ≤500 chars), using the click-tag timeline as a hint but relying mainly on content matching. gpt-4o-mini, tool-calling, validates IDs/dedupes/truncates. | `EvaluationHub:500` (`handleMapToNotes`) |
| `extract-insights` | **false** | Older path: produces `{summary_html, domain_insights[strengths/growth]}` for observation/self/coaching sources, with an HR-safe "Professional Filter." | `BatchProcessorContext.tsx:164` (Delivery-tab batch) + orphaned `ObservationRecorder.tsx` |
| `format-evaluator-note` | true | Tidies the coach's free-form note (spacing only). | `evaluations.ts:504` |
| `notify-eval-release` | true | Email on release. | `evaluations.ts:831/874` |
| `generate-audio` / `save-audio` | true | TTS / audio persistence — used by Learning content, **not** the eval flow today. |

**Active path today (the brain-dump primitive already exists):**
record → auto-save draft blob → `handleFinishAndTranscribe` → `transcribe-audio` (+chunking) →
`format-transcript` → `map-observation-notes` → notes written to each `evaluation_items.observer_note`
(`EvaluationHub:560`). This is *exactly* the spine the EX1 vision needs.

**Note:** `ObservationRecorder.tsx` and `InterviewRecorder.tsx` are **orphaned** — imported nowhere
except themselves. They use the older `extract-insights` path. Likely dead code from a prior design.

### 1.4 Delivery / release flow

- **UI:** `src/components/admin/eval-results-v2/DeliveryTab.tsx`, a sub-tab of the admin EvalResults v2
  page. Per-location collapsible rows with status pills
  (`not_released→released→viewed→reviewed→focus_set`), "Release All"/"Hide All", and per-staff
  Release/Hide. Data via `useEvalDeliveryProgress`.
- **Who can release:** coach OR org admin OR super admin (checked in the RPCs). The owner's intent is
  "org admin releases," but the code does **not** restrict release to admins — any coach can.
- **RPCs (`20260211170312`, hardened in `20260313150029`):**
  - `release_single_evaluation(eval_id, visible, released_by)` — flips `is_visible_to_staff`, stamps
    `released_at/by` via COALESCE. Org-boundary check via `is_same_org_eval`.
  - `bulk_release_evaluations(location_id, period_type, quarter, year, visible, released_by)` — same,
    location-wide. Returns count.
  - Both authorize via the **legacy `is_coach/is_org_admin/is_super_admin` flags on `staff`**, not
    `user_capabilities` (see backlog B2).
- **Staff view:** `mark_eval_viewed` → `compute_and_store_review_payload` (v2) →
  `EvaluationReview.tsx` 8-step wizard (Welcome, Note from Coach, Full Evaluation, Highlights, Keep
  Crushing, Grow, ProMoves, Note to Self) → `save_eval_acknowledgement_and_focus` writes
  `staff_quarter_focus`. All gated on `status='submitted' AND is_visible_to_staff`.
- **Auto-release drift:** the submit toast and `submitEvaluation` say release is a separate admin
  step, but migration `20260421203850` manually auto-released one eval and its comment says
  *"matches new submit behavior,"* implying submit-time auto-release was at least experimented with.
  **The actual policy is ambiguous in the codebase** (EX3).

---

## 2. Bugs & friction (ranked)

Ranked by product impact × confidence. `file:line` where load-bearing.

| # | Sev | Finding | Evidence | Maps to |
|---|---|---|---|---|
| 1 | High | **Competency is the authoring unit; Pro Move is the product unit.** 126 competency rows per eval, scored/noted individually. The evaluator must mentally map observations → competency, which is the exact friction the owner describes. Pro Moves never appear in authoring. | `evaluations.ts:115` seeds one item per `competencies.role_id`; `evaluation_items` PK is `(evaluation_id, competency_id)`. | EX1 |
| 2 | High | **The "brain-dump → auto-slot" capability exists but is gated behind per-competency tap-tagging.** `map-observation-notes` already auto-attributes; but the UI asks the coach to tap each competency row *while recording* to build a timeline, reintroducing cognitive load. Content-matching alone would likely suffice. | `EvaluationHub.tsx:279` (`handleCompetencyTap`), timeline passed at `:503`; function relies "primarily on content matching" (`map-observation-notes/index.ts:45`). | EX1 |
| 3 | High | **Recording is a fragile multi-step state machine.** Pause/resume produces webm Whisper rejects (handled via ElevenLabs fallback + user-facing "record in one take" message); segment concatenation, draft auto-save/restore, floating pill, intersection observers, and ~15 pieces of recording state all live in one 1,900-line component. | `transcribe-audio/index.ts:168-177, 195-202`; `EvaluationHub.tsx:94-127` state soup; segment logic `:138-180, :388-414`. | EX2 |
| 4 | Med | **Submit→release policy is ambiguous in code.** UI says "release later from Delivery tab," but a migration auto-released an eval calling it "new submit behavior." No single documented rule; risk of evals sitting unreleased or being unexpectedly auto-visible. | `EvaluationHub.tsx:905`; `submitEvaluation` `evaluations.ts:553`; vs. `20260421203850`. | EX3 |
| 5 | Med | **Release is not actually admin-gated.** Owner's model is "org admin delivers," but `release_single_evaluation`/`bulk_release_evaluations` allow any `is_coach` too. | `20260313150029:120, :161`. | EX3 |
| 6 | Med | **Baseline evals are not unique per staff/year.** UNIQUE is `(staff_id, program_year, quarter, type)`; Postgres treats NULLs as distinct, so Baseline (quarter=NULL) rows can duplicate silently. `createDraftEvaluation` tries `.maybeSingle()` with `.is('quarter', null)` and will throw if dupes already exist. | `20250820223300:19-21`; `evaluations.ts:135-148`. | EX3 |
| 7 | Med | **Staff review degrades to "sparse" below 4 scored competencies**, hiding Highlights/Grow/ProMoves. A coach who brain-dumps prose but scores few items gives the staff member a thin review. | `compute_and_store_review_payload` v2 `20260211180832:59` (`v_sparse := v_scored_count < 4`). | EX4 |
| 8 | Low | **Two AI insight paths coexist.** `map-observation-notes` (per-competency notes, active) vs. `extract-insights` (domain summaries, batch-only). `extracted_insights` is written by the batch processor and the **orphaned** `ObservationRecorder`, but the staff wizard renders from `review_payload`, not `extracted_insights`. Unclear what consumes `extracted_insights` today. | `BatchProcessorContext.tsx:163`; `ObservationRecorder.tsx:162` (orphaned); review reads `review_payload` (`EvaluationReview.tsx:63`). | EX1/EX4 |
| 9 | Low | **`extract-insights` has `verify_jwt = false`** (it does check the header internally, but it's the only eval-pipeline function left public in config). | `supabase/config.toml`. | — |
| 10 | Low | **`EvaluationHub` is a ~1,900-line god component** mixing recording, transcription, mapping, scoring, metadata editing, and storage I/O. High change-risk for any redesign. | `src/pages/coach/EvaluationHub.tsx`. | EX1/EX2 |
| 11 | Low | **Legacy interview/self-assessment remnants.** `interview_transcript`, `extracted_insights.self_assessment`, `audio_recording_path` upload UI, `InterviewRecorder` — all from the retired self-eval-interview design. Dead weight that confuses the model. | `isLegacyInterviewEval` `evaluations.ts:48`; `handleFileUpload` `EvaluationHub.tsx:1179`. | EX1 |

---

## 3. Redesign direction

*Direction, not spec. Two options where the trade-off is real.*

### 3.1 What the vision needs vs. what exists

The owner wants: **evaluator records one long free-form brain-dump → system auto-slots it into the
right competency/Pro Move, prioritizing Pro Moves they flag as needing work.**

Already built (the spine): audio capture, robust transcription with fallback, transcript formatting,
and `map-observation-notes` — an LLM that **already splits one transcript into per-target notes by
content matching.** This is ~70% of the vision.

Missing:
1. **Pro-Move-level targets.** Today the only targets are competencies. The vision names Pro Moves.
2. **A "flag Pro Moves to work on" up-front step** so the model can prioritize them.
3. **Removal of the per-item tap-tagging** so the brain-dump is genuinely free-form.
4. **Score inference** (or decoupling scores from notes) so a prose brain-dump still yields a complete
   staff review (fixes the sparse-degrade in finding #7).

### 3.2 Smallest viable change (recommended first move)

**Flip the default authoring interaction:** make "record one brain-dump" the primary action and
auto-slotting the default; demote manual per-competency scoring to a *review/correct* step.

Concretely, in priority order:
1. **Drop tap-tagging from the happy path.** Let `map-observation-notes` attribute purely by content
   (it already claims to). Keep the timeline as an optional power-user hint. *Smallest possible change;
   directly attacks EX1's cognitive load.*
2. **Add a pre-record "what should we focus on?" picker** that lets the evaluator flag a handful of
   Pro Moves/competencies. Pass them to `map-observation-notes` as priority targets so the model
   front-loads attribution and the staff review centers them. Persist as the eval's intended focus.
3. **Have the AI propose scores, not just notes.** Extend `map-observation-notes` (or add a sibling)
   to return a suggested 1–4 per touched item with the note, pre-filling the score grid for the coach
   to confirm. This both removes manual scoring drudgery *and* fixes the "sparse review" degrade.
4. **Surface a single review screen**: "Here's what I heard, slotted into N areas — edit, rescore,
   or discard." One screen, not two tabs + a recording state machine.

### 3.3 The Pro-Move question (the real architectural fork)

Whether to introduce Pro-Move-level granularity is the **decision that shapes everything**:

- **Option A — keep competency as the storage unit, present Pro Moves as the UI lens.** Map the
  brain-dump to competencies (as today), but show the coach the Pro Moves *under* each competency for
  context, and let the staff focus-select Pro Moves (as today). *Pro: zero schema change, low risk,
  reversible. Con: the stored note is still competency-grained; "feedback on a specific Pro Move"
  isn't first-class.*
- **Option B — add `pro_move_id` (`action_id`) to `evaluation_items` (or a child table) and make the
  Pro Move the authoring/feedback unit.** *Pro: matches the product's mental model and the vision
  exactly; feedback, scoring, and focus all align on one unit. Con: 332 Pro Moves vs 126 competencies
  = more targets to attribute and score; schema migration; review_payload/RPC rewrites; data
  migration of 1,696 existing items. Higher blast radius.*

**Recommendation:** ship 3.2 under **Option A first** (prove the brain-dump flow with zero schema
risk), then evaluate Option B once you see whether content-matching to 126 competencies is accurate
enough — if coaches keep "re-slotting" to a finer grain, that's the signal to go to Pro-Move targets.

### 3.4 Delivery & EX4 polish (lower urgency, lands alongside)

- **Decide and encode one release policy** (finding #4). Either submit auto-releases (drop the
  separate step) or submit stays gated (then enforce admin-only release, fixing #5). Document it as an
  ADR and reflect it in the submit toast + RPC auth.
- **Joyful delivery (EX4)** is mostly a content problem, and the review wizard already frames it well
  (Highlights / Keep Crushing / Grow / Note from Coach). The lever is the *generation* prompts:
  ensure every released eval has a warm `evaluator_note` and non-sparse highlights. The score-inference
  change in 3.2.3 is what guarantees "complete."

---

## 4. Open questions for the owner

1. **Pro Move vs. competency:** do you want feedback stored *at the Pro Move level* (Option B), or is
   "competency note, Pro Moves shown for context + focus selection" (Option A) enough? This is the
   single biggest fork.
2. **Release policy:** should submitting an evaluation **auto-release** it to the staff member, or must
   an admin always release separately? (The code currently contradicts itself.) And if separate —
   should *coaches* be able to release, or **org admins only**?
3. **Scoring:** in the brain-dump future, do you still want a 1–4 score per item, or is narrative
   feedback (+ optional AI-suggested scores the coach confirms) sufficient? Scores currently drive the
   entire staff review payload.
4. **Up-front focus:** should the evaluator flag "Pro Moves to work on" *before* recording (priming the
   AI) or *after* (curating what the AI found)? The vision implies before.
5. **Baseline model:** with backlog C1 in play (first eval as baseline), do we keep `type='Baseline'`
   at all? If so, fix the duplicate-Baseline uniqueness gap (finding #6).
6. **Legacy cleanup:** OK to delete the orphaned `InterviewRecorder`/`ObservationRecorder`, the
   `audio_recording_path` upload UI, and the `interview_transcript`/self-assessment-insight paths?
   They're dead but still shape the data model.
7. **`extracted_insights` fate:** what still consumes it? If only the batch processor writes it and
   nothing user-facing reads it, it can likely be retired in favor of `review_payload`.

---

## 5. Key files (for whoever picks this up)

- Authoring: `src/pages/coach/EvaluationHub.tsx`, `src/lib/evaluations.ts`,
  `src/components/coach/RecordingStartCard.tsx`, `SummaryTab.tsx`, `ProMovesAccordion.tsx`,
  `FloatingRecorderPill.tsx`, `src/hooks/useAudioRecording.tsx`, `src/lib/audioChunking.ts`.
- AI pipeline: `supabase/functions/{transcribe-audio,format-transcript,map-observation-notes,extract-insights,format-evaluator-note,notify-eval-release}/index.ts`.
- Delivery: `src/components/admin/eval-results-v2/DeliveryTab.tsx`, `src/hooks/useEvalDeliveryProgress.tsx`,
  `BatchTranscriptProcessor.tsx`, `src/contexts/BatchProcessorContext.tsx`.
- Staff review: `src/pages/EvaluationReview.tsx`, `src/lib/reviewPayload.ts`,
  `src/components/review/CompetencyCard.tsx`.
- Schema/RPCs: `supabase/migrations/20250820222724…` (origin),
  `20260128144756…` (`is_visible_to_staff`), `20260211170312…` (delivery cols + RPCs + focus),
  `20260211180832…` (review_payload v2), `20260313150029…` (org-scoped RLS + hardened release RPCs).

> **Archived 2026-08-19 (DOC-5).** This is a historical record, accurate about the past, and is not a description of how the system works today. Do not treat it as current. For the present state see docs/README.md.

# Evaluation Data Management & Surfacing Audit

> **Status:** Findings only, no code changes made. 2026-07-23.
> **Trigger:** Alexia Andari's Q2 eval shows blank on "view" and reads as "no eval"
> on the summary tab.
> **Method:** live read-only DB forensics (Supabase MCP) + two full code-path traces
> (write paths, read/surfacing paths). Every code claim is cited `file:line` and marked
> confirmed-from-code; every data claim comes from the live DB on the audit date.

---

## 1. Executive summary

Alexia's blank eval is not a one-off. It is one visible instance of a population of
**"hollow" evaluations**: evaluation rows that are `submitted`, `released`, and
`visible_to_staff`, but have **zero `evaluation_items`** (the per-competency 1-4 scores).

- **29 hollow evals are currently released to staff**: 22 in Q1 2026, 7 in Q2 2026.
  Alexia appears in both.
- These are **not empty shells**. They carry real work: observation dates, audio
  recordings, interview transcripts, and AI-extracted insights. What they never got
  was the structured scores (`evaluation_items`) and the `evaluator_note`.
- The scores were **never persisted** and are **not recoverable** from the surviving
  data (the AI insights are narrative only, no numbers). The raw interview transcripts
  survive, so re-scoring is possible but re-derivation, not recovery.
- Root cause is a chain of missing guards, all confirmed in code: a completion check
  that passes vacuously for zero items, a submit with no item guard, and a bulk-release
  with no item guard. The new (V2) capture flow cannot repair these because its item
  writer is update-only.
- The two reported symptoms come from two surfaces reading two different stores for the
  same eval: the viewer LEFT-joins items (renders **blank**), the summary RPC INNER-joins
  items (renders **"no eval"**).

The system currently has **four different "stores"** a surface can read an eval from and
**at least six independent read implementations**, each with its own visibility and
zero-item behavior. That fragmentation is why the surfaces disagree. The back half of
this doc proposes a unification.

---

## 2. The reported bug, traced end to end

Alexia's three evals (live DB):

| Eval | Type | Status | Visible | `evaluation_items` | `review_payload` |
|---|---|---|---|---|---|
| 2025 Baseline | Baseline | submitted | **false** | 16 (scored) | none |
| 2026 Q1 | Quarterly | submitted | true | **0** | present, `sparse:true` |
| 2026 Q2 | Quarterly | submitted | true | **0** | present, `sparse:true` |

Her Baseline has real items but was never released. Her Q1 and Q2 are hollow. So:

- **"Blank on view":** `EvaluationViewer` (`src/pages/EvaluationViewer.tsx:188`) reads via
  `getEvaluation` (`src/lib/evaluations.ts:252`), which LEFT-joins `evaluation_items`. A
  hollow eval returns a valid row with `items: []`, so the body renders nothing and the
  header reads "0/0 scored" (`EvaluationViewer.tsx:291,317`).
- **"No eval" on the summary tab:** `StatsEvaluations` (`src/pages/stats/StatsEvaluations.tsx:40`)
  calls the RPC `get_evaluations_summary`, which **INNER JOINs** `evaluation_items`. Zero
  items produces zero rows, so the eval vanishes and the page shows "No evaluations yet".
- Same underlying row, opposite outcomes, purely because one read LEFT-joins and the other
  INNER-joins the missing items.

The `review_payload` on Q1/Q2 is a red herring for the content: it is a **computed summary**
(`compute_and_store_review_payload`, `supabase/migrations/20260624210000_*.sql:7`), and it is
`sparse:true` precisely because there were fewer than 4 scored items at compute time
(`:46-52`). It is a symptom of the missing items, not an alternate copy of them.

---

## 3. Data forensics: the hollow-eval population

**Distribution across all evals (live DB, audit date):**

| Cohort | Submitted evals | With items | Zero items | Zero-item AND visible |
|---|---|---|---|---|
| Baseline 2025 | 13 | 13 | 0 | 0 |
| Quarterly Q4 2025 | 13 | 12 | 1 | 0 |
| Quarterly **Q1 2026** | 26 | 4 | **22** | **22** |
| Quarterly **Q2 2026** | 35 | 28 | **7** | **7** |

Baseline and Q4-2025 are clean. The failure begins with Q1 2026 (almost the whole quarter
hollow) and continues intermittently into Q2 (7 stragglers).

**The hollow evals carry real work** (Q1+Q2 2026 submitted, hollow n=29 vs healthy n=32):

| Signal | Hollow | Healthy |
|---|---|---|
| `observed_at` set | 24 | 25 |
| audio recording | 14 | 4 |
| interview transcript | 19 | 4 |
| extracted AI insights | 19 | 4 |
| `evaluator_note` | **0** | 26 |
| staff actually viewed it | 27 | 29 |

This is the fingerprint of **two capture flows**. The healthy evals look manual: an
`evaluator_note` plus scored items, little audio. The hollow evals look audio/AI-driven:
recordings, transcripts, and insights, but no `evaluator_note` and no scores. 27 of 29
were already opened by the staff member, who saw a blank page.

**Not misfiled.** For every hollow eval, the same staff + year + quarter has no sibling eval
holding the items (`sibling_with_items = 0`, `any_sibling = 0`). The items do not exist
elsewhere. This rules out "the viewer is opening the wrong eval id."

**Organic, not a single bulk insert.** The 22 Q1 hollow evals span **3 evaluators across 9
distinct days** (2026-01-22 to 2026-02-09) and all 22 were edited after creation. So they
were not stamped out by one script; they were each worked on by a coach.

**Recoverability.** Of the 19 hollow evals that still have insights, **0 contain any numeric
score** (no `score` / `rating` / `n/4` anywhere in the blob) — only narrative domain
strengths/growth. Interview transcripts survive for those 19. So original scores are gone;
re-scoring from transcripts (AI-assisted or manual) is the only path back to numbers.

**Affected staff (currently released, hollow):**
- **Q1 2026 (22):** Abigail Reyes, Alexia Andari, Almalleli Rebollar, Ayriana Crayton,
  Candice Porter, Chelsea Carrasco, Christina Sigler, Clarissa Chavez, Emilee Ericson,
  Faith Ropes, Gissell L Soto, Jacqueline Hernandez, Jacqueline Reyes, kelly acuna,
  Maricella Trevino, Melissa Negrete Vazquez, Rachel Diaz, Sophia Sarabia, Susan Soto,
  Taylor Dredla, Vanessa Lazaro, Vivian Ishihara.
- **Q2 2026 (7):** Alexia Andari, Andrea Davila, Britney Hernandez, Chelsea Carrasco,
  Vivian Ishihara, Yami Torres, Young Park.

---

## 4. The true bugs (confirmed in code)

**B1 — Completion check is vacuously true for zero items.** `isEvaluationComplete`
(`src/lib/evaluations.ts:610-629`) computes `observerComplete = evaluation.items.every(...)`,
which returns `true` for an empty array, and `missingObserverNotes` is `0`. So
`canSubmit = true`. The classic **EvaluationHub** enables its Submit button for a hollow eval
(`EvaluationHub.tsx:1489`) and does not early-return on empty items. **This is the primary
gate that lets a hollow eval be submitted.**

**B2 — Submit has no item guard.** `submitEvaluation` (`src/lib/evaluations.ts:553-571`)
sets `status='submitted'` with no count check. Reachable from EvaluationHub
(`EvaluationHub.tsx:901`) and admin single-submit (`LocationEvalDetail.tsx:119`).

**B3 — Bulk release has no item guard.** RPC `bulk_release_evaluations`
(`supabase/migrations/20260313150029_*.sql:146-192`) flips `is_visible_to_staff=true` +
`released_at` for every submitted row matching (location, year, quarter, type), with no
`evaluation_items` check. Called via `bulkSetVisibilityByLocation`
(`src/lib/evaluations.ts:847`). **This is how hollow evals reached staff en masse and why
the affected rows cluster on a handful of release dates.**

**B4 — Item-seed is not atomic with eval creation.** `createDraftEvaluation`
(`src/lib/evaluations.ts:192`) inserts the `evaluations` row, then inserts the seed
`evaluation_items` at `:211`. If the item insert throws, the parent row is **not rolled
back**, leaving a persisted 0-item draft. The retry branch (`:150-158`) returns the existing
draft's items (empty) **without re-seeding**. This is the most likely origin of the zero-item
state (the write-path trace ranks it #1; the organic Q1 clustering supports it over a bulk
insert).

**B5 — V2 capture cannot repair a hollow eval.** `saveCaptureItem`
(`src/lib/evalCaptureData.ts:129`) is **update-only** (keyed by evaluation_id + competency_id).
On an eval with no item rows it affects zero rows and returns no error, so scoring in the new
flow silently goes nowhere. The V1 per-field setters (`setObserverScore`, etc.,
`src/lib/evaluations.ts:379+`) have the same update-only shape, meaning a coach could have
typed scores into a hollow eval and had them silently discarded.

**B6 — `get_evaluations_summary` is defined twice (overloaded).** Both
`(p_staff_id)` and `(p_staff_id, p_only_submitted default true)` exist
(`src/integrations/supabase/types.ts:4164-4194`). A one-argument call is ambiguous to
PostgREST/Postgres and can error "function is not unique". Both copies INNER-join items (the
B-store behavior in section 5).

**B7 — The blank-vs-missing split itself.** The INNER JOIN in `get_evaluations_summary` (any
consumer) hides hollow evals; the LEFT join in `getEvaluation` shows them blank. Neither
degrades to an honest "this evaluation has no scores yet" state. Only one surface in the whole
app does that today (`StaffDetailDrawerV2`, see section 5).

---

## 5. Surfacing map: four stores, six-plus readers

Every place that reads an eval trusts one of four stores. This table is the core of the
fragmentation.

| Store | What it reads | Zero-item behavior |
|---|---|---|
| **A. `getEvaluation`** | `evaluations` + LEFT-embed `evaluation_items` (`evaluations.ts:252`) | row returns, `items:[]` → **blank body** |
| **B. `get_evaluations_summary` RPC** | `evaluations` INNER JOIN `evaluation_items` (two overloads) | **zero rows → eval invisible** |
| **C. `compute_and_store_review_payload` RPC** | recomputed jsonb summary | `sparse:true` / empty, or rejected → `null` |
| **D. `get_eval_distribution_metrics` RPC** | admin analytics aggregate | placeholder "No eval" row |
| **E. `evaluations` row only** | no items, no payload | works regardless of items |

**Reader inventory (confirmed-from-code):**

- **Participant viewer — full scores:** `EvaluationViewer` → **A**. Blank on hollow. Requires
  `status='submitted'`; visibility enforced only for own-eval non-coach/admin
  (`EvaluationViewer.tsx:196,203,209`).
- **Participant viewer — review wizard V1/V2:** `EvaluationReview` / `EvaluationReviewV2` →
  **C** (they recompute the payload; they select `review_payload` the column but do not use
  it). Both hard-require `submitted` + `is_visible_to_staff`. V1 has a `sparse` degrade branch;
  V2 explicitly removed it, so a hollow eval yields an empty walkthrough
  (`EvaluationReview.tsx:100`, `EvaluationReviewV2.tsx:108`).
- **Route gating of the two wizards diverges:** only `EvalReadyCard` uses `reviewPath()` /
  the `eval_review_v2` localStorage flag (`src/lib/reviewRoute.ts`); in-wizard and viewer
  buttons hardcode `/review` (V1). So which wizard a user lands in depends on the entry point.
- **Summary tab:** `StatsEvaluations` → **B** + a separate `is_visible_to_staff` re-query.
  "No eval" on hollow.
- **Delivery tab / release:** `useEvalDeliveryProgress` → **E**. Correct status on hollow (it
  never needed items). This is where hollow evals get released with no warning (B3).
- **Coach staff detail:** `StaffDetailV2` → **E** (count only); `QuarterlyEvalsTab` →
  **A**-shaped list (items embedded but unused); "View" links to the blank **A** viewer,
  "Edit" opens `EvaluationHub` (**A**).
- **my-role:** `useDomainDetail` → **B** + direct `evaluation_items` re-fetch + visibility
  re-query (`src/hooks/useDomainDetail.ts:68,81,105`). Hollow eval never selected and
  contributes no score. `RoleRadar` → **B**. (Note: the crash on this page was a separate
  bug, fixed 2026-07-23 in commit `3bfec925`.)
- **Admin eval-results v2:** aggregate tables → **D**; drilldown `StaffDetailDrawerV2` →
  **direct evaluation_items** with a real empty-state ("No evaluation items found",
  `StaffDetailDrawerV2.tsx:172`) — the one surface that handles hollow honestly; exports use
  INNER-embed items (hollow excluded); v1 `SummaryMetrics` uses a third pattern (direct items
  + `get_location_domain_staff_averages`).

**Visibility logic is re-implemented independently** in at least four places (StatsEvaluations,
RoleRadar, useDomainDetail each re-query `is_visible_to_staff`; EvaluationViewer applies a
different own-vs-coach rule; the wizards hard-require it). There is no single visibility gate.

---

## 6. Recommendations

Two separate tracks. Track A cleans up the existing damage and stops new damage. Track B is
the simplification/unification you asked about. Track A does not require Track B.

### Track A — stop the bleeding and clean the data (small, targeted)

1. **Add the missing guards (B1-B3).** Make `isEvaluationComplete` require at least one scored
   item (guard the vacuous `.every()`); make `submitEvaluation` refuse an eval with zero
   scored items; make `bulk_release_evaluations` / `release_single_evaluation` skip (and
   report) evals with zero items. These three are the whole "how did this happen" story.
2. **Make item-seed atomic (B4).** Move `createDraftEvaluation`'s row + item-seed insert into a
   single RPC/transaction, or have the retry branch re-seed when it finds zero items. Prevents
   new hollow drafts.
3. **Make hollow read honestly (B7).** Every viewer should show "this evaluation has no scores
   recorded" instead of a blank page, matching `StaffDetailDrawerV2`.
4. **Decide what to do with the 29 released hollow evals** (see open decisions). At minimum,
   un-release them so staff stop opening blank evals; ideally re-score the 19 that still have
   transcripts.
5. **Collapse the duplicate RPC (B6).** Drop the one-arg `get_evaluations_summary` overload;
   keep the two-arg version.

### Track B — unify the surfacing (the real simplification)

The root architectural problem is four stores and six-plus readers. Target one contract.

1. **One read contract per eval.** Introduce a single source (a `get_evaluation_detail(eval_id,
   viewer)` RPC or one shared hook) that returns the eval row, its items, and a computed
   summary together, applies the visibility rule **once**, and returns an explicit
   `hasScores` flag. Every viewer, the summary tab, my-role, and coach detail consume that one
   thing. This is what kills the blank-vs-missing divergence permanently.
2. **Retire one of the two capture flows.** V1 EvaluationHub (vulnerable, update-only setters,
   vacuous completion) vs V2 EvaluationCapture (guards zero items, but update-only writer).
   Pick V2 as canonical, fix its writer to upsert, and remove V1. This was already flagged as
   Phase 3 item 3.5 / gate D-d in the navigation remediation plan; the eval data bug is the
   forcing function to actually do it.
3. **Retire one of the two review wizards** (V1 vs V2) and stop the entry-point-dependent
   routing; drive it from one flag or, better, remove the flag once V2 is canonical.
4. **Make `review_payload` clearly derived, not a store.** It is a cache of a computation over
   items. Either always recompute on read, or treat the column as a cache with explicit
   invalidation. Right now some surfaces select it and ignore it, which invites the
   "is the data in the payload or the items?" confusion that started this audit.
5. **One visibility gate.** Centralize the `is_visible_to_staff` + own-vs-coach rule in the
   single read contract from B1, so it is not re-implemented (differently) in four places.

---

## 7. Open decisions for John

- **D-1 (data):** For the 29 released hollow evals, which path?
  (a) un-release all 29 and re-run the interview/scoring, (b) AI-re-score the 19 with surviving
  transcripts and hand-verify, or (c) leave Q1 as historical narrative-only and only fix Q2
  going forward. This drives how much Track A step 4 costs.
- **D-2 (capture):** Confirm V2 `EvaluationCapture` as the canonical flow to keep (Track B step
  2). If yes, V1 EvaluationHub and its vacuous completion check go away rather than getting
  patched.
- **D-3 (review viewer):** Confirm V2 as the canonical review wizard (aligns with the existing
  `eval_review_v2` flag and gate D-d in the nav plan).
- **D-4 (scope):** Do Track A now (guards + data cleanup, low risk, high relief) and schedule
  Track B as its own slice, or fold both into one evaluation-system slice?

---

## Appendix — how to re-run the forensics

All queries were read-only against project `yeypngaufuualdfzcjpk`. The load-bearing ones:
distribution by cohort (section 3 table), the hollow-vs-healthy "evidence of work" counts,
the sibling-items check (proves not-misfiled), the Q1 evaluator/day spread (proves organic),
and the insights numeric-score scan (proves not-recoverable). Re-running them after any
remediation is the verification that the hollow population is shrinking, not growing.

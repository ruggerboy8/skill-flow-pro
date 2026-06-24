# Feature Spec — Unifying the Evaluation View Surfaces

*Status: planning. Date: 2026-06-24. Source: design-ux-architect audit.*
*Concern (owner): several surfaces show "the full evaluation" differently for staff vs evaluators;
unify where possible and properly contextualize the routes by which each audience arrives.*

> Plan, not a build. Conservative migration applies: build new alongside old, migrate callers one
> at a time, never break a live path.

---

## 1. The surfaces today

Five surfaces render an individual evaluation, split across two data models: the raw
`evaluation_items` model and the curated, version-gated `review_payload` model.

| # | Surface | Route | Audience / entry | Data model | Shows |
|---|---|---|---|---|---|
| A | `EvaluationViewer` | `/evaluation/:evalId` | Staff ("View evaluation"), coach ("View"), admin spot-check (Delivery, with `?returnTo`) | raw `evaluation_items` | per-domain score table, notes accordion, participation snapshot, evaluator note, legacy insights tab |
| B | `EvaluationHub` | `/coach/:staffId/eval/:evalId` | Evaluator (authoring + read-only) | `evaluation_items` | the editor: scoring, notes, recording, participation (Summary tab) |
| C | `EvaluationReview` (V1) | `/evaluation/:evalId/review` | Staff wizard | `review_payload` | 8-step wizard; step 2 **navigates away to A**; sparse gate; single notes toggle |
| D | `EvaluationReviewV2` | `/evaluation/:evalId/review-v2` | **No production entry yet** (URL only) | `review_payload` v4 | rebuilt wizard with in-wizard per-domain Glow/Grow walkthrough, neutral N/A, closing recap |
| E | `EvalResultsV2` / `DeliveryTab` | `/admin/evaluations` | Admin aggregate + release | aggregate | drill-in to A for spot-check |

---

## 2. Where they diverge (the real problems)

1. **Same eval, two data models, three framings.** A and read-only B render raw `evaluation_items`;
   C/D render the curated `review_payload`. The new Glow/Grow + neutral-N/A model exists **only in D**.
   A and B still show notes as undifferentiated blobs and N/A as absence.
2. **Participation snapshot is in A and B, missing from C/D.** Staff in the guided wizard never see it
   unless they take the off-ramp.
3. **The V1 off-ramp is a surface seam.** Step 2 bounces to A and relies on the browser back button.
   V2 fixes this by inlining the walkthrough, but V2 is not wired up.
4. **Score colors diverge.** A/B hardcode Tailwind pills; D uses the `--score-N` tokens.
5. **One component, conflicting audiences.** A serves staff self-view and admin spot-check from one
   path with identical framing; it has no notion of "I authored this" or "I'm checking before release."
6. **Admin spot-check sees staff framing, not a quality lens** (contradicts overhaul §4.2).

---

## 3. Unification proposal

**One role-aware read component on the `review_payload` model, with a shared body reused by the
wizard; keep `EvaluationHub` as the authoring tool (do not merge the 1,900-line editor).**

- **`<EvaluationBody>`** — extract V2's per-domain walkthrough (`EvaluationReviewV2.tsx:312-375`) into
  a reusable presentational component (per-domain Glow/Grow, score tokens, neutral N/A, participation
  snapshot, evaluator note). Consumed by the read view, the wizard's "Your evaluation" step, and the
  evaluator pre-submit review (overhaul §3.3). One data model, one set of tokens.
- **`<EvaluationDetail mode>`** — a thin role-aware wrapper around `<EvaluationBody>` replacing
  `EvaluationViewer`. `mode` resolved from auth, not URL params:

  | | self (staff) | evaluator (coach) | admin (spot-check) |
  |---|---|---|---|
  | Header | "Your Q2 review" | "{Staff}'s Q2 — you authored this" | "{Staff}'s Q2 — pre-release spot-check" |
  | Self-vs-observer scores | de-emphasized | shown | shown |
  | Coverage signals | hidden | shown | prominent |
  | Affordance | none | "Back to edit" | Release (admin-gated) |
  | `mark_eval_viewed` | yes | no | no |

- **`EvaluationHub` read-only** renders `<EvaluationBody>` instead of the disabled-editor layout, so
  even the Hub's view matches everyone else. Authoring path untouched.

---

## 4. Route contextualization

Routes encode *what* but not *who/why* today (context smuggled via `?mode`, `?returnTo`, `isOwnEval`).

- `/evaluation/:evalId` → role-aware `<EvaluationDetail>`; resolve mode from auth (own → self;
  evaluator → evaluator; admin → admin). Callers stop needing to know which framing to request.
- Staff review stays a distinct **write** route `/evaluation/:evalId/review` (a stateful wizard),
  repointed to V2; drop `/review-v2` after promotion.
- Admin spot-check gets explicit intent (`?intent=spotcheck` or `/admin/evaluations/:evalId`) so the
  detail leads with coverage/quality framing + release control. Update `DeliveryTab`.
- Evaluator "Preview as staff will see it" entry from the Hub opens `/evaluation/:evalId` in evaluator
  mode (also the overhaul §3.3 pre-submit review). Authoring stays at `/coach/:staffId/eval/:evalId`.

---

## 5. Conservative path (sequenced)

- **P0 — Wire up V2 behind a flag, leave V1 live.** V2 already exists and is unreachable; route a
  subset (super-admins or a flag) from `EvalReadyCard`/`CurrentFocusCard` to `/review-v2`. Verify the
  v4 payload populates Glow/Grow + N/A for real evals first. *No old path touched.*
- **P1 — Extract `<EvaluationBody>`** from V2's walkthrough (pure refactor; V2 consumes it).
- **P2 — Build `<EvaluationDetail mode>`** alongside `EvaluationViewer`; route the admin spot-check
  (Delivery) to it first (most forgiving audience, most needs the new framing).
- **P3 — Repoint read callers** one at a time by blast radius: Delivery → coach "View" → staff
  `StatsEvaluations`. Delete `EvaluationViewer` only when grep shows zero callers.
- **P4 — Promote V2 to `/review`, retire V1**; redirect `/review-v2` → `/review`.
- **P5 — Hub read-only renders `<EvaluationBody>`; add evaluator "Preview as staff."**

### Cross-cutting risks
- **Legacy insights** (`extracted_insights` / `summary_feedback`) render only in A's Insights tab; the
  payload model has no equivalent. Decide explicitly: map them into the payload, or keep A as a
  legacy-only fallback. Do not silently drop them.
- **Baseline** removal (overhaul §4.3) still appears in the Hub and gates the participation snapshot;
  sequence unification after/with Baseline removal.
- **Access control is duplicated client-side** with subtly different rules across A/C/D; unifying the
  read view is the moment to consolidate (verify RLS enforces independently).
- **`mark_eval_viewed`** must fire exactly once in self mode and never in evaluator/admin mode, or the
  Delivery "viewed" state corrupts.

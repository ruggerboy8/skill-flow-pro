# Spec: MOB-4, Recognition intake — make a glow expected at eval capture, source-extensible

**Status:** draft, awaiting John's approval
**Lane:** cross-cutting (capture-flow change + schema)
**Ticket:** MOB-4 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-4-glow-intake
**DB change:** yes — additive, idempotent columns on `evaluation_items` (details below)
**Personas to test as:** coach / evaluator running a capture session (the only writer today); office-manager / regional / lead as *future* source values (no flow built now)
**Depends on:** nothing. **Blocks:** MOB-5 (the recognition surface has nothing to show until glows are actually being captured with a source).

## What and why

Recognition is starved at intake: the skeleton records **9 glows vs 125 grows
across 864 items, and zero glows since June** (`mobile-redesign-skeleton.md`
§3 "Recognition"). MOB-5 will surface a glow to the staff member on Home and
Performance, but there is nothing worth surfacing until intake is fixed. So the
strict order is intake first (this ticket), surfacing second (MOB-5) — the plan
calls this out explicitly (`mobile-redesign-plan.md` Wave 1, "intake before
surfacing").

Two decided changes (both from the 2026-08-20 decisions log, plan lines 133–147
and skeleton §3 / §7 #3):

1. **Make a glow *expected* per competency at eval capture** — not optional,
   not hard-blocking. Today the capture flow requires only a Score, and a low
   score requires *a note* (glow **or** grow), never a glow specifically. The
   capture UX should strongly prompt and default a glow for each scored
   competency so the positive channel actually gets fed, while still letting a
   coach submit without one (a hard block would just breed empty filler).

2. **Add a glow-source field now**, kept loose. Today a glow's only attribution
   is the parent `evaluations.evaluator_id`; there is no per-item source. Add a
   source so a glow records *who gave it* — the evaluator today, extensible to
   office/regional managers and Lead RDAs later — **without assuming an
   evaluator**, because future glows may not come from eval capture at all.
   Build the *field*, not the multi-source flows.

## Grounded-in-code facts

- **Capture flow:** `src/pages/coach/EvaluationCapture.tsx`. Per competency it
  renders a required Score (line 546, labeled "(required)"), a free-form
  feedback textarea, a "Polish into glow & grow" button (line 578) that calls
  `separateFeedback()` and writes both `glow` and `grow`, and two editable
  Glow/Grow textareas that only appear *after* a polish or legacy split
  (line 583, gated on `selectedComp.glow?.trim() || selectedComp.grow?.trim()`).
- **The glow is optional today.** Submission gating (lines 338–341):
  `canSubmit = unscored.length === 0 && lowMissingNote.length === 0`, where
  `lowMissingNote` = competencies scored `<= 2` with **neither** glow nor grow
  (line 339–340). A high-scored competency with no glow does not block
  submission; nothing anywhere requires a glow.
- **Empty glow is coerced to null.** `handleNoteBlur` (lines 250–256) and
  `handlePolish` (line 286) persist `observer_glow: comp.glow?.trim() ? comp.glow : null`.
- **Writes go through `saveCaptureItem()`** (`src/lib/evalCaptureData.ts`
  lines 149–174) — a direct `evaluation_items.update` keyed on
  `(evaluation_id, competency_id)`, not an RPC. Its patch type
  `CaptureItemPatch` (lines 120–128) is `observer_score`, `observer_is_na`,
  `observer_glow`, `observer_grow`, `observer_note`.
- **Schema:** `evaluation_items` (created in
  `supabase/migrations/20250820222745_*.sql`, PK `(evaluation_id, competency_id)`)
  carries `observer_glow` / `observer_grow` as plain nullable `text`
  (added additively in `supabase/migrations/20260624000000_eval_glow_grow.sql`),
  plus `domain_id` / `domain_name` (populated at seed in `createDraftEvaluation`,
  `src/lib/evaluations.ts` lines 203–209). **There is no per-item source
  column.**
- **`evaluations.evaluator_id`** is `uuid NOT NULL` and references `staff.id`
  (every reader joins `staff` on it, e.g. `EvaluationViewer.tsx` line 242,
  `EvaluationReviewV2.tsx` line 92). It is the single source attribution that
  exists today, and it is per-*eval*, not per-*item*.
- **Current staff identity is available in the client** via `useStaffProfile()`
  (`.id` is the logged-in staff member's id — used across hooks, e.g.
  `useDomainDetail.ts` line 58). This is what stamps the source at capture.

## The schema decision (recommended: additive columns on `evaluation_items`)

The binding docs already decided *that* a glow-source field is added now
(plan line 146: "**DB:** capture-flow change + a glow-source column (decided)";
skeleton §7 #3). The open architectural choice was **a new column vs a small
recognition model.** Recommendation: **add nullable columns to
`evaluation_items` now**, and shape them so they can later be lifted into a
`recognitions` table without a re-model. Reasoning:

- MOB-5 reads `evaluation_items.observer_glow` directly (per its spec). Keeping
  the glow *and its source* on the same row means MOB-5 needs one read, no join
  to a second table, and no write-path fork during capture.
- It mirrors the proven additive, idempotent pattern already used for
  `observer_glow` itself (`20260624000000_eval_glow_grow.sql`) — the SQL-editor
  apply path per CLAUDE.md, migrations lagging deploy.
- A full `recognitions` table is the right home *when a non-eval-capture glow
  source actually ships* (a lead sending "warm fuzzies," a manager recognizing
  someone outside a review). Building it now would be speculative
  infrastructure the plan explicitly defers ("Don't build the multi-source
  flows now").

**The one honest tension** (surfaced, not hidden): a column *on
`evaluation_items`* structurally ties a glow to eval capture, which is in slight
tension with "future glows may not come from eval capture at all." The
resolution is to make the *field semantics* source-agnostic even though its
*location* is the eval item: the columns record the giver and a loose source
*type* independent of `evaluator_id`, so when the `recognitions` table is
introduced these columns migrate into it 1:1 (see Open questions #1). The field
does not assume an evaluator; only its current storage location does, and that
is acceptable because eval capture is the only writer that exists.

### Recommended migration (additive, idempotent — SQL-editor apply path)

```sql
-- MOB-4: per-item glow source attribution. Additive + idempotent.
-- Records WHO gave the glow, independent of evaluations.evaluator_id, so a glow
-- is not inferred from the eval's evaluator and the field is forward-compatible
-- with a future source-agnostic recognitions table.
ALTER TABLE public.evaluation_items
  ADD COLUMN IF NOT EXISTS glow_source_staff_id uuid,
  ADD COLUMN IF NOT EXISTS glow_source_type text;

-- Intentionally NO foreign key and NO CHECK constraint on glow_source_type:
-- keep it loose so future source types (office_manager, regional_manager, lead,
-- peer, system) need no migration. 'evaluator' is the only value written today.
COMMENT ON COLUMN public.evaluation_items.glow_source_staff_id IS
  'Staff who GAVE this competency''s glow (observer_glow). Set explicitly at capture from the acting user, not inferred from evaluations.evaluator_id. Nullable; forward-compatible with a future recognitions table.';
COMMENT ON COLUMN public.evaluation_items.glow_source_type IS
  'Loose source label for the glow: evaluator (today), later office_manager / regional_manager / lead / peer / system. No CHECK by design; extend without a migration.';
```

Notes on the migration, per CLAUDE.md:
- No `staff_id` FK deliberately — avoids the RLS/cross-table dependency traps
  the project has been bitten by, and keeps the column decoupled from the
  `staff` lifecycle (the giver may be deactivated later; the attribution should
  survive). The app resolves the name by id the same way it already resolves
  `evaluator_id` (grep shows five call sites doing exactly this).
- Not deprecating or touching `observer_glow` / `observer_grow` / `observer_note`
  — purely additive.
- Local Supabase does not auto-grant privileges the way hosted does
  (global CLAUDE.md); no new grants are needed here since `evaluation_items`
  already has its policies and the columns inherit table-level access.

## Approach (grounded in the real files)

1. **Extend the write path.** In `src/lib/evalCaptureData.ts`, add
   `glow_source_staff_id?: string | null` and `glow_source_type?: string | null`
   to `CaptureItemPatch` (lines 120–128). `saveCaptureItem` needs no other
   change — it already updates whatever the patch carries, and the columns are
   cast past generated types the same way `observer_glow` is (the file already
   comments on that cast, line 157).

2. **Stamp the source when a glow is written.** In `EvaluationCapture.tsx`,
   whenever a non-empty glow is persisted (`handleNoteBlur` line 250 and
   `handlePolish` line 286), include the source: `glow_source_type: 'evaluator'`
   and `glow_source_staff_id: <current staff id>` from `useStaffProfile()`.
   When the glow is cleared to null, clear the source alongside it (keep the two
   consistent — a source with no glow is meaningless). Resolve the acting
   staff id from `useStaffProfile().id`; fall back to the eval's
   `evaluator_id` (already loaded) if the profile id is unavailable, so the
   source is never silently empty for a real glow.

3. **Make a glow *expected* per competency (soft, not a hard gate).** Two moves,
   both UX-only:
   - **Default the glow surface visible.** Today the Glow/Grow textareas only
     appear after a Polish (line 583). Show the Glow field (with its Sun icon
     and a prompt like "What did they do well here?") for the selected
     competency once it has a score, so a glow is an expected, always-present
     field rather than a hidden by-product of Polish. Grow stays as-is.
   - **Add a soft "missing glow" line to the Review & submit dialog.** Alongside
     the two existing checks (lines 618–633), add a third, informational row:
     "N competencies don't have a glow yet — recognition is the one thing staff
     actually want back." Style it as a nudge (muted / status-pending), **not**
     a blocker. **Do not add it to `canSubmit`** (lines 341, 684) — "expected"
     means strongly prompted, not enforced. A coach can still submit; the plan
     is explicit that a hard block "would just breed empty filler."

4. **Per-competency granularity is already satisfied** — glows live on
   `evaluation_items` keyed per competency, and the source columns are on the
   same row, so MOB-5 can select a glow by competency→domain (skeleton §7 #3:
   "Glows stay captured per competency (competency → domain gives the selection
   its handle)"). No structural change is needed to get per-competency; only the
   source stamp and the expected-glow UX are new.

## Acceptance criteria (behavioral, testable)

1. Running an eval capture, each scored competency shows an always-visible Glow
   field (prompting recognition), not one that only appears after Polish. Grow
   behavior is unchanged.
2. When a coach saves a non-empty glow (by typing + blur, or via Polish), the
   row records `glow_source_staff_id` = the acting coach's staff id and
   `glow_source_type` = `'evaluator'`. Clearing the glow to empty also clears
   both source columns (no orphaned source).
3. The Review & submit dialog shows a **soft, non-blocking** line counting
   competencies with a score but no glow. Submitting is still permitted when
   that count is greater than zero (the glow is *expected*, not *required*); the
   existing hard checks (every competency scored/N-A; low scores have a note)
   are unchanged.
4. A glow captured through this flow is readable by a query that joins
   `glow_source_staff_id` → `staff.name` the same way `evaluator_id` is resolved
   today, so MOB-5 can attribute "Ariyana noticed…" from the source, not from
   the eval's evaluator.
5. The migration is idempotent: running it twice adds nothing the second time
   (`ADD COLUMN IF NOT EXISTS`), and existing rows keep null source columns
   without error.
6. The classic `EvaluationHub` flow and every existing reader of
   `observer_glow` / `observer_grow` / `observer_note` behave exactly as before
   (purely additive change; no existing column touched).

## Files touched

- **DB:** one new migration
  `supabase/migrations/<ts>_mob4_glow_source_columns.sql` (the additive block
  above), applied via the SQL editor per CLAUDE.md.
- `src/lib/evalCaptureData.ts` — extend `CaptureItemPatch` with the two source
  fields (no logic change to `saveCaptureItem`).
- `src/pages/coach/EvaluationCapture.tsx` — stamp the source on glow writes
  (`handleNoteBlur`, `handlePolish`); default the Glow field visible per scored
  competency; add the soft missing-glow line to the Review & submit dialog.
- `src/integrations/supabase/types.ts` — optional: regenerate or hand-add the
  two columns so the cast can eventually be removed (not required to ship; the
  existing `as never` cast pattern already handles untyped columns).

## Risks / blast radius

- **Additive only.** No existing column is altered or dropped, so no
  deployed-code-vs-DDL ordering hazard (the "DB DDL must lag deploy" rule): the
  new columns can exist in prod before the app writes them with zero effect on
  current readers. Ship the migration first, then the app change — safe either
  order.
- **Source/glow drift.** If a glow is saved but the source stamp fails (or vice
  versa), attribution is wrong. Mitigation: write both in the same
  `saveCaptureItem` patch (one update statement), and clear both together.
- **"Expected" over-reach.** Making the glow field always visible must not read
  as *required* (no red asterisk, no submit block) — the whole point is to
  invite recognition without manufacturing filler. Keep the label a warm prompt,
  the review line a nudge.
- **Confined to the capture surface + one additive migration.** No RLS change,
  no function change, no effect on the 67 non-flagged staff or on the classic
  editor.

## Open questions for John

1. **Column now vs `recognitions` table now.** Recommended: columns now (above),
   table later when a non-eval-capture source actually ships. Confirm you're
   comfortable that the *first* non-eval glow source (e.g. a lead sending warm
   fuzzies) is what triggers building the `recognitions` table, and that these
   two columns are designed to migrate into it 1:1. If you'd rather pay that
   cost once, up front, I can spec the table instead — but it's speculative
   infrastructure today.
2. **Source `type` vocabulary.** I propose free-text with `'evaluator'` as the
   only value written now and no CHECK constraint (so future types need no
   migration). Confirm you don't want an enforced enum. Candidate future values:
   `office_manager`, `regional_manager`, `lead`, `peer`, `system`.
3. **Who is "the source" at capture — the acting user or the eval's evaluator?**
   Recommended: the acting user (`useStaffProfile().id`), because a future world
   has non-evaluator sources and the acting user is the truthful giver. In
   practice today they're the same person. Confirm, or prefer stamping
   `evaluations.evaluator_id` verbatim.
4. **Should a glow ever be *required* for high scores specifically?** The
   decision is "expected, not required" across the board. Flagging in case you
   want a middle ground later (e.g. require a glow only on 4s, where there's
   clearly something to praise). Not built here.

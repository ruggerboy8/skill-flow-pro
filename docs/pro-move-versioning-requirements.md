# Pro Move Versioning — technical need and rationale

> **Status:** Requirements document, July 2026. Written to hand to an implementing agent with no other context. Defines WHAT must exist and WHY; the implementer owns the schema and mechanism design. **This must land before the next round of framework edits** (Dr. Alex has a revision batch pending).

## Context, in three sentences

ProMoves stores a competency framework as rows: `roles → domains → competencies → pro_moves`, with assessment tables (`doctor_baseline_items`, `coach_baseline_items`, `weekly_scores`, `evaluation_items`) referencing `pro_moves.action_id` directly. The framework is becoming licensed intellectual property in a commercial partnership, which means its content needs the properties of an IP asset: history, attribution, and auditability. Today, editing a pro move silently rewrites what every historical score meant, and deleting one erases history entirely.

## Evidence that this is a real problem (all verified against this repo and the live DB, July 28, 2026)

1. **A pro move was destroyed by an ID collision and nobody noticed for months.** Migration `20260205204734` created action 4003 ("verbalize the exam note in its entirety") under competency 401. Migration `20260205213744` reused action_id 4003 for a different statement with `ON CONFLICT DO UPDATE`, overwriting the statement while leaving the competency assignment. The original was only recovered because it was later re-authored in-app as action 189. Nothing recorded that any of this happened.
2. **Six doctor pro moves were deleted between February and July with no record** (former actions 4007, 4015, 4026-variant, 4028, 4031, 4040, 4041; at least one, 4007 caries-risk charting, produced data another live move, 4008, depends on). Whether each deletion was a deliberate decision or an editing accident is now unknowable, and the owners are having to reconstruct intent from memory.
3. **Historical assessments reference `action_id` directly**, so when a statement is edited, old self-ratings and coach ratings are silently reinterpreted against language the rater never saw. Coach baselines were captured in June and July against wording that has already drifted from the February seed.
4. **Internal documents disagree about basic facts** (44 versus 53 active doctor moves) because there is no authoritative "the framework as of date X" object to cite.
5. **The validation program requires per-version metrics.** The framework method (`edustack` repo, `docs/pedagogy/framework-method.md`) commits to logging, per item: retranslation rate, content-validity index, pilot ceiling rate, and self-versus-coach agreement. Those numbers are meaningless unless pinned to the exact wording that was tested.
6. **Licensing requires provenance.** To license the framework into a partner's scoring engine, we must be able to state, per item: who authored it, when, from what source, under what evidence label, and what changed since. None of that is currently recorded.

## Requirements

**R1 — Immutable version history per pro move, including its learning content.** Every change to `action_statement`, `description`, `competency_id`, or active/retired status produces a permanent version record carrying: prior and new values, author, timestamp, and a short free-text reason. History is append-only; nothing can rewrite it. **The same applies to `pro_move_resources`** (the curated per-move learning content: `doctor_why`, `doctor_good_looks_like`, `doctor_script`, `doctor_gut_check`, and the link/script/video rows): this content is part of the licensed asset, it is authored by a named clinician, and edits to it must be as traceable as edits to the statements.

**R2 — No silent mutation path.** The requirement holds regardless of how the edit arrives: Builder UI, platform console, SQL migration, or Lovable-applied change. (Note this repo's migration workflow: Lovable applies migrations that land on `main`, and `supabase db push` is broken per `CLAUDE.md`; a database-level capture mechanism is therefore preferable to an application-level one, since migrations bypass application code.)

**R3 — Retirement, never deletion.** `pro_moves` already has `retired_at` / `retired_by`; the gap is enforcement. Hard `DELETE` on framework content must be prevented (the six vanished moves above arrived through some live path). A retired move remains queryable with its full history.

**R4 — Assessments resolve to the version in force when they were scored.** Any assessment row must be interpretable against the exact wording the rater saw: either a direct reference to the version record, or deterministic resolution via timestamps. Existing rows must remain resolvable at least to "February seed wording" versus "current wording" (see R8).

**R5 — Named framework releases.** A release = a named, immutable snapshot of one role's full framework (e.g. `doctor-2026.07`), listing exact member versions **of both the pro moves and their attached `pro_move_resources` content**. Pilots, partner integrations, and validation studies pin to a release. A queryable diff between any two releases (added, retired, reworded, reclassified, content-changed) satisfies the changelog need.

**R6 — Versioned item metadata.** Add and version alongside each pro move: `evidence_label` (one of: evidence-based, expert-consensus, practice-derived), source/citation text, license/reuse note, and author attribution. These fields exist for the licensing and validation programs and must travel with the version, not the head row.

**R7 — Composes with per-org overrides.** `organization_pro_moves`, `organization_pro_move_overrides`, and `organization_pro_move_content_overrides` already fork content per tenant. Versioning must not break these; org-level content changes should ideally get the same history treatment, but platform-item history is the priority.

**R8 — Backfill what is reconstructable.** Two states are recoverable: the February seed (migrations `20260205204734`, `20260205213744`, `20260205214509`) and the current live state. Record both as retroactive releases with an explicit "history gap: Feb–Jul 2026 edits unrecorded" marker rather than pretending continuity.

**R9 — Edit-reason capture in the UI (phase 2, not blocking).** The Builder / platform library edit surfaces should prompt for a one-line reason on save. Until then, reason may default to "unrecorded (UI edit)".

## Acceptance criteria

- Editing a pro move's statement via SQL and via the UI both produce version records automatically; the old wording remains retrievable.
- `DELETE FROM pro_moves WHERE action_id = ...` fails or is converted to retirement.
- A query can answer: "show the doctor framework exactly as of June 12, 2026" (the date of the first coach baseline) — post-backfill, at least to the granularity of R8.
- A query can answer: "what changed between release A and release B, and why."
- Creating a release is cheap enough to do at every meaningful editing milestone.

## Out of scope

Full temporal-table infrastructure, a UI diff viewer, versioning of non-framework tables, and retroactive recovery of the unrecorded February-to-July intermediate states (impossible; R8's gap marker is the honest answer).

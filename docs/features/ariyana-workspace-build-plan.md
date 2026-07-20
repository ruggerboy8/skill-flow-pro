# Ariyana's Workspace — Build Plan (Slice 1)

> **Status:** Ready to build — 2026-07-20.
> **Specs:** [ariyana-workspace-prd.md](ariyana-workspace-prd.md) (requirements) +
> the clickable prototype (v3) is the visual/interaction spec.
> **Decisions locked:** pipeline stages **Identified → Communicated → Assessed →
> Retired**; List + Board + By-location views; manual follow-up (no nudges); retire
> outcomes **Landed / Let it go / Keeps coming back**; issue tagged to 0..N
> locations OR Global; Ariyana-scoped access.
>
> **Guardrail from this session:** the schema here is **purely additive** (new
> tables nothing else reads), so it's safe to land before the UI deploys. No
> changes to existing tables/columns. Ship code-first regardless.

## Slice 1 scope (the spine)

The private issues workspace: capture → move through the pipeline → retire to
history. This is self-contained and immediately useful to Ariyana.

**In:** add an issue (manual + "turn a signal into an issue"); the three views
(List / Board with drag / By-location); the detail drawer (stage stepper, sources,
timeline/history, follow-up notes, private note-to-self); retire-with-outcome →
history/archive; reopen. A read-only low-confidence "signal" card (static for now).

**Out (later slices):** transcript ingest, the lead-focus declaration + build-the-
meeting surface, live low-confidence aggregation, longitudinal location report,
lead-facing pieces. See "Roadmap" below.

## Data model (additive — new tables only)

All `public.*`, uuid PKs, RLS on. Written idempotently (`CREATE TABLE IF NOT
EXISTS`), granted to `authenticated`.

- **`coaching_issues`** — `id`, `organization_id`, `created_by` (staff.id),
  `title`, `detail`, `stage` (`identified|communicated|assessed`, default
  `identified`), `is_global` (bool), `status` (`active|retired`, default `active`),
  `retired_outcome` (`landed|let_go|recurring`, null unless retired),
  `retired_note`, `private_note`, `created_at`, `updated_at`, `retired_at`.
- **`coaching_issue_locations`** — `issue_id` FK, `location_id` FK. 0..N rows. (An
  issue is either `is_global = true` or carries location rows, or both.)
- **`coaching_issue_sources`** — `issue_id` FK, `source_type`
  (`visit|doctor|leads|signal`). 0..N rows.
- **`coaching_issue_events`** — `id`, `issue_id` FK, `at`, `kind`
  (`created|stage_change|note|declared_focus|retired|reopened`), `body`,
  `by_staff`. This is the timeline **and** the "on the list from X to Y" record —
  the measurement when there's no KPI.

**RLS (Ariyana-scoped for now):** each policy allows a row when
`created_by = current staff` **AND** the caller passes the workspace gate, plus
super-admin. Reuse the Ask-Alcan access pattern (`src/lib/askAlcanAccess.ts`) as
the gate model; scope to Ariyana + super admins initially, generalizable to a
"training director" capability later (ties to the permission consolidation, G2).

**Types:** hand-write a `coachingWorkspaceTypes.ts` (Lovable owns the generated
`types.ts`), following the `surveyTypes.ts` precedent.

## Frontend

- **Route + nav:** new `/training` route rendering a `TrainingWorkspace` page; add a
  gated **Training** item to the sidebar. `Layout` is now single-sourced through
  `useUserRole` (Phase 2), so add the nav conditionally on the new gate. Guard the
  route with the existing `RequireAccess` wrapper.
- **Components** (mirror the prototype; reuse shadcn + the design tokens in
  `CLAUDE.md`):
  - `IssueList` (List view), `IssueBoard` (drag between Identified/Communicated/
    Assessed), `IssuesByLocation` (grouped, Global first).
  - `IssueDrawer` (stage stepper, sources, `IssueTimeline`, add-note, private note,
    retire trigger).
  - `AddIssueDialog`, `RetireDialog` (outcome + note), `HistoryDialog` (archive +
    reopen), and the static `SignalCard` with "turn into issue" → prefilled add.
  - Drag-drop: prefer `@dnd-kit` if already a dep; else native HTML5 DnD (as in the
    prototype). Every drag path also has a non-drag equivalent (the stepper) for a11y.
- **Data:** React Query hooks over the supabase client, following
  `useStaffProfile`/`ProMoveList` patterns. Writes emit a `coaching_issue_events`
  row (stage change, note, retire, reopen) so history is automatic.

## Reuse
- Access gate: `src/lib/askAlcanAccess.ts` pattern.
- Route guard: `src/components/RequireAccess.tsx` (Phase 2).
- Color/status/domain tokens + icon sizing: `CLAUDE.md` design system.
- Hand-written types: `surveyTypes.ts` precedent.

## Migration & deploy
1. Land the UI code (nav gated so it's invisible until we flip access) — the new
   tables aren't referenced by any existing surface.
2. Apply the additive migration (new tables + RLS) via the dashboard SQL editor or
   MCP `apply_migration`, idempotent. Safe to run anytime — nothing else reads these
   tables, so there's no old-frontend-vs-new-schema risk.
3. Flip access on for Ariyana; verify.

## Verification (end-to-end, in the app)
- As Ariyana: add an issue; move it Identified→Communicated→Assessed in **both** the
  Board (drag) and the drawer stepper; add a follow-up note and confirm it lands in
  the timeline; retire with an outcome and confirm it leaves the board and appears in
  History with the date range; reopen it. Toggle List / By-location; tag an issue to
  multiple locations and Global and confirm both views render it correctly.
- As another user: confirm the Training nav is absent and `/training` redirects
  (RLS + route guard).
- `tsc --noEmit` + `npm run build` green.

## Roadmap (after Slice 1)
- **S2 — Lead focus (standalone):** `lead_focus_items` (+ optional nullable
  `pro_move_id`), the sequencer-style declaration UI, AI-polish, assembled meeting
  view; declaring moves issues to Communicated.
- **S3 — Transcript ingest:** reuse `transcribe-audio → format-transcript →
  extract-insights`; per-candidate location attribution (as in the prototype).
- **S4 — Low-confidence aggregation:** per location × Pro Move, min-N = 3.
- **S5 — Longitudinal location report + private per-staff notes.**
- **Fast-follow (lead-facing):** weekly focus on the lead home, "Ariyana wants to
  chat" scheduling button, and wiring focus items into the live `FacilitatePage`.

# Dev Workflow Kit: Build Instructions (for a fresh Claude Code session)

**Status:** v1, 2026-08-18. This is the hand-off document John opens a NEW
Claude Code session with. It turns `docs/dev-workflow-redesign.md` (the
analysis, read it first) into a concrete build. Everything here is a
proposal John approved in principle on 2026-08-18; the session executing
this should still confirm each phase's plan with John before building it
(that is the workflow being installed, so practice it).

John's day-to-day habits for working in Warp + Claude Code (starting/
resuming sessions, plan mode, verification, the short command list) are
in `docs/dev/cli-best-practices.md`. Point him back there rather than
re-explaining; add to it, don't duplicate it.

## Zero: orientation for the executing session

Read, in order: `CLAUDE.md`, `docs/dev-workflow-redesign.md`,
`docs/system-overview.md`. Then this doc. The autoDev source is at
`github.com/eschnei/autodev` (Apache-2.0); it is a reference to borrow
from with attribution, not a dependency to install.

Decisions already made by John (do not reopen):
- Build our own **workflow kit** (custom skills + one hook + a board),
  not adopt the autoDev plugin. Borrow its two-gate shape, fresh-agent
  QA, tests-as-ship-requirement, repro-first bugs, human-only merge, and
  its push-guard/docs-guard hooks. Do not copy its persona machinery,
  headless timer, BrainGrid, or multi-backend tracker.
- The board is **Motion**, driven via the existing Motion MCP.
- The kit is **project-specific**: every spawned agent is pointed at the
  right subset of this repo's docs by task type.
- Model tiering by role: Opus-class for spec/audit/review, Sonnet for
  building from a spec, Sonnet/Haiku for mechanical QA walks.
- Lovable stays the acceptance environment for anything data-shaped;
  Publish is only ever clicked with Lovable's branch picker on `main`.
- Desktop production behavior is never changed by kit work.

## Phase 1: hygiene prerequisites (small PRs, John's first merges)

Each is its own branch + PR; John merges each on GitHub. This is the
warm-up rep for the merge-then-Publish rhythm.

1. **Test runner.** Add Vitest + @testing-library/react + jsdom, a
   `vitest.config.ts`, an `npm test` script, and ONE real test (suggest:
   `src/lib/roleCompetencyMerge.ts`, the lead merge-then-filter helper;
   it is pure, load-bearing, and was a real bug). Wire `test` into the
   `build:check` script below.
2. **CI.** `.github/workflows/ci.yml`: on pull_request to `main`, run
   `npm ci`, `npx tsc --noEmit -p tsconfig.app.json`, `npm run lint`,
   `npm test`, `npm run build`. Also add an `npm run check` script that
   runs the same locally so Claude runs it before every PR.
3. **Branch protection on `main`:** require a PR and the CI check. Do
   this on GitHub with John (it's a settings click; walk him through
   it). Verify Lovable's bot can still push (it commits to `main`
   directly; if protection blocks it, use a bypass allowance for the
   Lovable app rather than dropping the rule).
4. **Guard hook.** `.claude/hooks/` PreToolUse on `Bash`: refuse
   `git push` to `main`/`origin main` and any `--force`; refuse
   `Edit`/`Write` to `CLAUDE.md`. Wire in `.claude/settings.json`
   (project-scoped, committed). Adapted from autoDev's `guard-push.sh`
   / `guard-docs.sh` with attribution in the file header.
5. (Trails, bigger) **Non-production Supabase**: local `supabase start
   -x vector,logflare` per the global machine notes, with `.env.local`
   pointing at it. Needed before any QA agent runs the app against a
   database. Track as its own ticket; not a blocker for phases 2-4.

## Phase 2: the Motion board

**Already created (2026-08-18):** Motion workspace **RGC**
(`ZZsR0WU1WQ9PtV1hODNL4`), project **"Skill Flow Pro: Dev Board"**
(`pr_ByxCRJw1KBQLo81NmxJxV2`), seeded with four tickets (phases 1, 2+3,
4, 5). RGC has only default statuses (Backlog / Todo / Completed /
Canceled), so **stage is tracked by label**. Gotcha learned: the Motion
MCP fails task creation with unknown labels, so the labels must be
created in the Motion app first (stage:backlog, stage:spec-approved,
stage:building, stage:qa, stage:ready-to-review, stage:merged,
stage:published; lane:tiny, lane:medium, lane:cross-cutting, lane:bug),
then the seed tickets relabeled. Until then, stage lives on a
`Stage:` line in each description.

Create (via the Motion MCP) a project for this repo's dev work. Statuses
should map to the pipeline: **Backlog → Spec Approved → Building → QA →
Ready to Review → Merged → Published**. If Motion's status model per
workspace resists custom statuses, use labels for the stage and keep the
default statuses; the executing session should check
`motion_statuses` first and pick the workable mapping.

Every dev task description carries a fixed block (write a template file
at `docs/dev/ticket-template.md`):
```
Lane: tiny | medium | cross-cutting | bug
Spec: <path to spec doc, or "inline" for tiny>
Branch: <name>
PR: <url>
Acceptance script (do X, expect Y): ...
QA verdict: <pending | pass | fail: ...>
Personas to test as: participant | lead | admin(desktop)
DB change: none | <migration + apply-order note>
```
Motion is the single source of truth for what is in flight; specs and
acceptance scripts live in the repo under `docs/specs/<slug>.md` and are
linked from the ticket.

## Phase 3: the skills (the kit itself)

Create project skills under `.claude/skills/` (committed). Each is a
SKILL.md; keep them short and point at repo docs rather than restating
them. Names and contracts:

- **`/spec <one-line ask>`** — Gate 1. Interviews briefly, writes
  `docs/specs/<slug>.md` (what/why, acceptance script, personas,
  out-of-scope, lane, DB impact, docs the builder must read), creates
  the Motion ticket in Backlog, and STOPS for John's approval. On
  "approved" it moves the ticket to Spec Approved. Runs on the session
  model (Opus-class).
- **`/build <ticket>`** — cuts `feature/<slug>` (or `fix/<slug>`) in a
  worktree, spawns a **Sonnet** subagent with the spec + the doc subset
  the spec names + the Ground rules from
  `docs/features/mobile-build-instructions.md`; requires tests for new
  logic; runs `npm run check`; commits per ticket section; never pushes
  to `main`. Moves ticket to Building, then to QA when the builder
  reports.
- **`/qa <ticket>`** — Gate 2 prep. Spawns a **fresh** subagent (never
  the builder) that walks the acceptance script and, for medium and up,
  an adversarial "try to break it" and a regression walk of adjacent
  routes; produces a pass/fail-per-item report plus a "not verifiable
  live" list. Posts the report to the ticket; moves to Ready to Review
  on pass, back to Building on fail (with the report). Model: Sonnet
  (Opus for cross-cutting).
- **`/repro <symptom>`** — bug lane entry. Reproduces first: identifies
  the failing path and writes a failing test or a documented manual
  repro BEFORE any fix; creates the ticket with the repro attached; then
  hands to `/build`.
- **`/ship <ticket>`** — pushes the branch, opens a PR with the spec
  link, build report, QA report, and the acceptance script written for
  John; prints the human checklist: switch Lovable to the branch, walk
  the script as the named personas, switch Lovable back to `main`,
  merge on GitHub, Publish. Never merges. Moves ticket to Ready to
  Review; John moves it to Merged/Published.

Also: a tiny **`/status`** that reads Motion and prints what's in flight
with stage, branch, and PR, so John can ask "where are we" from any
session.

Doc-routing table (put it in `.claude/skills/_shared/doc-routing.md`
and have `/spec` copy the relevant rows into each spec):
- schema/DB → `docs/data-model.md`, CLAUDE.md "Framework content is
  versioned" + "DB DDL must lag deploy" memory
- mobile UI → `docs/features/mobile-design-principles.md`,
  `mobile-build-instructions.md` Ground rules, gating via
  `useMobileShell`
- Pro Move content → `docs/glossary.md`, framework-history rules
- evaluations → `docs/features/evaluation-*.md`, hollow-evals guard
- coaching/leads → `docs/management-model.md`
- anything → `docs/system-overview.md`, no em dashes, token conventions

## Phase 4: first use = the codebase assessment backlog

Run the kit's first real job on itself: `/spec` an assessment (the
existing `docs/audits/` are flagged stale in CLAUDE.md). The assessment
agent (Opus-class) sweeps: security/RLS drift, dead code and unused
branches (125 remote branches, most Lovable `edit/*`), duplicated logic,
missing tests on load-bearing helpers, dark-mode debt (the static
`getDomainColor` helpers), the mobile `EvaluationViewer` gap, doc
staleness. **Findings become Motion tickets, never fixes.** Each ticket
gets a lane and severity. John then works the backlog in tiny/medium
lanes as practice reps. Do this before the Alcan Way pilot.

## Phase 5: the pilot

Alcan Way Gallery 1 through the full kit, per
`docs/dev-workflow-redesign.md` section 8, once John has authored the
Gallery 1 content (see `docs/features/alcan-way-exhibit-concept.md`).

## Later (not now)

- The pipeline visualizer: an artifact page reading Motion via MCP that
  shows each ticket's stage/branch/PR/QA state.
- Non-prod Supabase (phase 1 item 5) enabling app-running QA.
- Trial `/autodev:repro` and `/autodev:qa` head-to-head against ours on
  one bug and one feature; adopt whichever wins.

## How the executing session should work

Confirm the plan for each phase with John in plan mode, then build.
Phases 1 and 2 are the first thing; each phase-1 item is its own PR
that John merges (his practice). Keep a running `docs/dev/kit-log.md`
of what was built and any deviation from this doc. Report in plain
language; John reads outcomes, not diffs.

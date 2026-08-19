# Spec: Codebase assessment (acquisition-readiness backlog)

**Status:** awaiting John's approval (Gate 1)
**Created:** 2026-08-18
**Lane:** cross-cutting
**Spec author:** `/spec`, Opus-class session model

## What and why

Skill Flow Pro was built first entirely in Lovable, then in Claude Desktop, and
is now moving to CLI management under the dev workflow kit. It has never had a
systematic engineering review. This is the kit's first real job, run on the
codebase itself: a wide, structured sweep that finds what is wrong, weak, or
undocumented, and converts every finding into a Motion ticket John can work as
a practice rep. The goal John stated is a codebase that reads as professional
and would hold up under technical due diligence in an eventual company
acquisition, with that acquisition being aspirational rather than imminent. So
findings are ranked primarily by engineering health and maintainability, with a
secondary marker on the ones a due-diligence reviewer would specifically flag.

**This produces tickets and one assessment document. It changes no code.**

## Scope: what gets swept

Nine passes, each a separate reviewer with its own brief:

1. **Security and secrets** - RLS policy drift against the live database, edge
   function auth (`verify_jwt` config in `supabase/config.toml`, which functions
   are public and whether they should be), credential and key handling in the
   repo and in client code.
2. **Multi-tenant isolation** - whether the Organization to Group to Location to
   Staff scoping actually holds in queries and policies. Refreshes
   `docs/archive/audits/multi-tenant-isolation-audit.md`, which predates recent work.
3. **Data model and migrations** - drift between the live schema and what the
   code expects, destructive patterns, and whether the framework-history and
   DDL-lags-deploy rules are being honored. **Bounded approach:** the live schema
   is read directly via the Supabase MCP and treated as truth. The 606 migration
   files are grepped for destructive and risky patterns rather than read in full;
   only the most recent set and any file a grep flags gets read. No line-by-line
   walk of migration history.
4. **Tests and CI** - the repo has exactly one test file against 421 source
   files. Identifies the load-bearing logic where a missing test is an actual
   risk (scoring, sequencing, permissions, date and week math) and whether the
   CI workflow catches what it should.
5. **Dead code, duplication, and branches** - unreferenced components and
   exports, duplicated logic, and the 130 remote branches (mostly Lovable
   `edit/*`). Assessment only; no branch is deleted without a separate approved
   ticket.
6. **Design system, dark mode, and accessibility** - compliance with the token
   and icon conventions in CLAUDE.md, the static `getDomainColor` dark-mode debt,
   hardcoded Tailwind color classes, and an accessibility pass on the primary
   flows.
7. **Performance and data fetching** - N+1 Supabase query patterns, unbounded
   selects, missing indexes on hot paths, render and bundle weight.
8. **Dependencies and licensing** - outdated and vulnerable packages, and license
   compatibility across the dependency tree. This is the pass with the highest
   due-diligence weight relative to its cost.
9. **Documentation, operability, and `the-alcan-way/`** - which docs are stale
   (CLAUDE.md already flags `docs/archive/audits/` and `docs/archive/architecture.md`), whether a
   new engineer could set up and run this project from the docs alone, and a
   review of the standalone `the-alcan-way/` sub-project.

## How findings become tickets

Derived from `docs/dev/ticket-template.md`, where every ticket carries a single
`Branch:`, `PR:`, and `QA verdict:` field, and from the lane definitions in
`docs/dev-workflow-redesign.md` section 5:

> **One ticket = one buildable unit that lands in one PR.**

- Findings that would naturally ship together in one PR are grouped into one
  ticket (for example, all hardcoded color classes in the evaluation surface).
- A theme too big for one PR is split into ordered tickets (for example,
  "missing tests" becomes one ticket per logical area, not one giant ticket).
- A finding that is genuinely one line gets its own tiny-lane ticket only if it
  does not belong with anything else.

Every ticket carries:
- The standard block from `docs/dev/ticket-template.md`
- `Lane:` tiny, medium, or cross-cutting
- `Severity:` critical, high, medium, or low, rated on engineering health
- `DD-flag:` yes or no, marking findings a due-diligence reviewer would raise
- A pointer to its section in the assessment document
- Plain-English statement of what is wrong and why it matters, written for John

Expected volume: 15 to 30 tickets. If a pass produces far more, its findings are
grouped harder rather than flooding the board.

## Deliverables

1. `docs/dev/assessment-2026-08-18.md` - the full findings document, organized by
   pass, each finding with file references, severity, DD-flag, and the ticket it
   became. This is the durable record and the thing you read.
2. Motion tickets on the MyProMoves Dev Board, all at `stage:backlog`.
3. `docs/dev/kit-log.md` - the running kit log the build instructions asked for
   and which does not exist yet. Created here, backfilled with phases 1 through 4.

## Execution

Nine reviewers run in parallel, one per pass, each pointed at only the docs and
directories its brief needs. Reviewers are read-only: they report findings and
never edit. The orchestrator then dedupes across passes, applies the
one-ticket-per-buildable-unit rule, ranks severity, and writes the documents and
tickets.

**Model tiering.** Cheapest model that can actually do each job, per John's
direction on 2026-08-18:

| Pass | Model | Why |
|------|-------|-----|
| 1 Security and secrets | opus | a missed auth hole is the expensive kind of miss |
| 2 Multi-tenant isolation | opus | cross-table reasoning, subtle failure mode |
| 3 Data model and migrations | Sonnet 5 | schema-versus-code comparison, mostly legwork |
| 4 Tests and CI | Sonnet 5 | |
| 5 Dead code and duplication | Haiku 4.5 | mechanical: find, verify unreferenced, report |
| 6 Design system, dark mode, a11y | Sonnet 5 | pattern matching against documented conventions |
| 7 Performance and data fetching | Sonnet 5 | |
| 8 Dependencies and licensing | Haiku 4.5 | reading `npm audit` output and license fields |
| 9 Docs, operability, the-alcan-way | Sonnet 5 | |

Orchestrator: Claude Fable 5, set as the session model.

**On the opus tier.** John prefers Claude Opus 4.6 over Opus 5. The subagent
model selector takes a tier alias (`opus`), not a version string, so Opus 4.6
cannot be requested that way. Before the sweep runs, test whether an agent
definition under `.claude/agents/` can pin `claude-opus-4-6` in its frontmatter.
If it can, passes 1 and 2 use it. If it cannot, passes 1 and 2 run on the `opus`
alias and the assessment document records that they ran on Opus 5.

**Note on cost.** John is on a Claude subscription, so this draws against plan
usage limits rather than per-token billing. Model tiering buys usage headroom,
not dollars.

Approving this spec is what authorizes the parallel reviewers.

## Acceptance script

Written for John. No app personas apply; this changes nothing users can see.

1. Open `docs/dev/assessment-2026-08-18.md`. Expect a findings document organized
   by the nine passes, where each finding says in plain English what is wrong,
   where it is, how bad it is, and which ticket covers it.
2. Open the Motion board. Expect 15 to 30 new tickets at `stage:backlog`, each
   with a lane, a severity, and a link back to its assessment section.
3. Pick any ticket at random. Expect to understand what it is asking for without
   opening a code file.
4. Run `git status`. Expect the only changes to be new documentation files.
   **Zero source code changes. Zero migrations. Zero deleted branches.**
5. Sort the board by severity. Expect the top of the list to be things that
   genuinely worry you, not cosmetics.

## Personas to test as

Not applicable. This produces no user-facing change and touches no runtime code.

## Out of scope

- **Fixing anything.** Findings become tickets. This is the kit's rule for the
  assessment phase and it is absolute.
- Deleting any of the 130 remote branches. The cleanup gets its own ticket that
  John approves separately.
- Any schema change, migration, or write to the live database. Reviewers read
  the live schema; they never write to it.
- Editing CLAUDE.md, which the guard hook blocks by design.
- Line-by-line review of all 606 migration files. See pass 3.
- Re-litigating decisions already locked in `docs/archive/simplification-roadmap.md`.

## DB impact

None. Read-only inspection of the live schema via the Supabase MCP.

## Docs the reviewers must read

Pulled from `.claude/skills/_shared/doc-routing.md`, routed per pass:

| Pass | Docs |
|------|------|
| All passes | `docs/system-overview.md`, CLAUDE.md conventions, no em dashes |
| 1 Security | `docs/archive/audits/security-rls-audit.md`, `supabase/config.toml` |
| 2 Isolation | `docs/enterprise-architecture.md`, `docs/archive/audits/multi-tenant-isolation-audit.md` |
| 3 Data model | `docs/archive/data-model.md`, CLAUDE.md "Framework content is versioned" and "Applying migrations", DB-DDL-lags-deploy memory |
| 4 Tests | `docs/archive/glossary.md`, `docs/archive/features/evaluation-*.md`, hollow-evals guard |
| 5 Dead code | `docs/archive/improvement-backlog.md`, `docs/archive/audits/code-quality-audit.md` |
| 6 Design system | CLAUDE.md design system conventions, `docs/features/mobile-design-principles.md`, `docs/archive/audits/ux-accessibility-audit.md` |
| 7 Performance | `docs/archive/data-model.md`, `docs/archive/architecture.md` |
| 8 Dependencies | `package.json`, lockfile |
| 9 Docs | `docs/archive/architecture.md`, `docs/archive/audits/`, `docs/archive/roadmap.md`, `the-alcan-way/` |

## Ticket breakdown

Cross-cutting lane, so the work is decomposed and ordered:

| # | Step | Depends on |
|---|------|-----------|
| 1 | Nine parallel reviewer passes | spec approval |
| 2 | Dedupe and cross-reference findings | 1 |
| 3 | Apply the one-ticket-per-buildable-unit rule, rank severity | 2 |
| 4 | Write `docs/dev/assessment-2026-08-18.md` | 3 |
| 5 | Create Motion tickets | 4, Motion MCP live after session restart |
| 6 | Write `docs/dev/kit-log.md`, backfill phases 1 to 4 | 4 |
| 7 | PR with the assessment doc and kit log, John merges | 4, 6 |

## Known risk

The board's own tickets are the output here, so a bad call on ticket sizing is
expensive to undo by hand. If step 3 produces something that looks wrong when
John reads it, the fix is to regroup before step 5 creates the tickets, not
after.

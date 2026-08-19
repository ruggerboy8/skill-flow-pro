# Dev workflow kit: build log

Running record of what was built for the dev workflow kit and where reality
deviated from `docs/dev-workflow-kit-instructions.md`. Specified by that document;
created late, during phase 4, which is itself recorded below as a deviation.

## Phase 1: hygiene prerequisites (2026-08-18)

Each item shipped as its own branch and PR, merged by John. This was deliberate
practice at the merge-then-Publish rhythm, not just process theatre.

| Item | PR | State |
|---|---|---|
| Vitest test runner, first test, `npm run check` | #6 | merged |
| CI workflow: typecheck, test, build on every PR | #7 | merged |
| Guard hook: block push-to-main, force-push, CLAUDE.md edits | #8 | merged |
| CLAUDE.md note on John's CLI experience level | direct | merged |
| CLI field notes for the move to Warp | direct | merged |

**Deviation: branch protection was never actually enabled.** Phase 1 item 3
called for it. The guard hook was built and merged, but it only protects the one
laptop it runs on. The assessment confirmed via `gh api` that `main` has no
protection rule, so CI is advisory and a red check does not block a merge. This
is now ticket **GOV-3**.

**Deviation: non-production Supabase (phase 1 item 5) not started.** Correctly
scoped as non-blocking at the time. Still outstanding, and the assessment found
it is the reason most of the codebase cannot be unit tested. Partially addressed
by ticket **TST-5**, which builds a cheap mocking seam instead and defers the
question of whether a real non-prod project is still needed.

## Phase 2: the Motion board (2026-08-18)

Workspace and project created, seeded with four tickets covering phases 1, 2+3, 4
and 5. Ticket template written to `docs/dev/ticket-template.md` (PR #9, merged).

**Deviation: names in the instructions were wrong.** The doc said workspace "RGC"
and project "Skill Flow Pro: Dev Board". The actual names are **Coding Projects**
and **MyProMoves Dev Board**; John renamed them. Corrected in the instructions
during phase 4.

**Resolved: labels.** The instructions predicted that Motion would reject task
creation with unknown labels and that stage would have to live on a `Stage:` line
in each description as a fallback. John created all eleven labels in the Motion
app, and phase 4 verified that the MCP both sets and persists them. Stage is now
tracked by label as originally designed. The `Stage:` description line is
redundant and should be dropped from the template.

## Phase 3: the skills (2026-08-18)

All six skills plus the shared doc-routing table, shipped in PR #10 (merged):
`/spec`, `/build`, `/qa`, `/repro`, `/ship`, `/status`, and
`.claude/skills/_shared/doc-routing.md`.

Phase 9 of the assessment independently verified that every artifact the
instructions specified actually exists and is wired up, with one exception: this
log, which did not exist until now.

## Phase 4: the codebase assessment (2026-08-18)

The kit's first real job, run on the codebase itself. Nine parallel read-only
reviewers, model-tiered. Output: `docs/dev/assessment-2026-08-18.md` and 35
Motion tickets. **No code was changed**, which was the rule for this phase and
held.

**Deviation: the Motion MCP was not available at the start.** The session that
wrote the spec had no Motion connection, so ticket creation was blocked. John
added the MCP server mid-session, after which the board was reachable and all 35
tickets were created directly.

**Deviation: 35 tickets, not the 15 to 30 the spec predicted.** Grouping harder
would have produced tickets too large to land in a single PR, which is the
kit's own definition of a ticket. The overage was flagged to John before creation
rather than silently absorbed.

**Deviation: Opus 4.6 could not be pinned.** The spec wanted passes 1 and 2 on
Opus 4.6, John's preference. The subagent model selector accepts tier aliases
only, not version strings, and no agent definition in `.claude/agents/` pins a
model. Passes 1 and 2 ran on the `opus` alias, which resolved to Opus 5.

**Two reviewer findings were wrong and were corrected before reaching the board.**
Dependency severities were inflated (DOMPurify reported critical with 18
vulnerabilities; it is moderate, and the project has zero criticals), and the
migration filename counts were reported backwards. Both corrections are
documented in the assessment. This is worth noting as a property of the method:
**agent output needs verifying, and the orchestrator checking it is part of the
job, not an optional extra.**

**Unplanned finding about the kit's own documentation.** Verifying the second
correction showed that CLAUDE.md's stated reason for `supabase db push` not
working describes 17 files from a single day in 2025. This may mean a daily
workflow constraint is unnecessary. Tracked as **DOC-2**.

**Board housekeeping.** The phase 1 and phase 2+3 seed tickets were still sitting
at Todo despite both being merged; both were closed. The phase 4 ticket was
relabelled through `stage:backlog` to `stage:spec-approved` as the gate was
passed, which was the first real exercise of the label-driven pipeline.

## Phase 5: the pilot

Not started. Alcan Way Gallery 1 through the full kit, per
`docs/dev-workflow-redesign.md` section 8, once the Gallery 1 content is authored.

Note that the assessment found `the-alcan-way/` is dormant with no deploy path and
is unreferenced from the main app (ticket **CLN-5**). That question is worth
settling before the pilot runs through it.

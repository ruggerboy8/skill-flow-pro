# Spec: DOC-5, restructure docs to serve the kit workflow

**Status:** approved by John 2026-08-19 (verbal, in session); assumptions 1 to 4 stand unless he says otherwise
**Created:** 2026-08-18
**Lane:** cross-cutting
**Ticket:** DOC-5

## What and why

The `docs/` folder grew around a workflow that no longer exists: John describes
intent to Claude Desktop, Claude edits, he checks it visually in Lovable, he hits
Publish. The AI shaped the docs to fit that mental model. That workflow has been
replaced by the kit: specs, tickets, gates, isolated branches, fresh-eyes QA, and
subagents that read a routed subset of docs to decide what to do.

The reason this is not cosmetic: **docs are an input to agent behavior.** A wrong
doc does not sit there harmlessly. It misroutes decisions. The clearest case found
so far is `docs/archive/progress.md`, which says "Read this at the start of every new
session," is five months stale, and prescribes the retired Lovable workflow. It is
a document that instructs an agent to trust it and then hands over an obsolete
process.

## The actual problem, measured

The 2026-08-18 inventory classified 73 markdown files:

| Status | Count |
|---|---|
| CURRENT | 25 |
| HISTORICAL RECORD | 24 |
| STALE BUT USEFUL | 9 |
| UNVERIFIED | 9 |
| ACTIVELY MISLEADING | 6 |

**A third of the docs describe the past, and nothing in the structure separates them from the docs describing the present.** That is the real defect. Folder names
are a symptom.

Four genuinely different kinds of document currently share one namespace:

1. **Canonical reference.** How the system works now. Agents must read these.
2. **Historical record.** What happened and why. Accurate about the past, and
   actively harmful if read as current. Agents must not treat these as authority.
3. **Work in flight.** Specs and tickets for what is being built. Agents read the
   one relevant to their task.
4. **Business material.** Client emails, a .docx, CSV exports, source content.
   Agents should not read these at all.

Right now an agent pointed at `docs/` cannot tell these apart, and neither can a
new engineer.

## Proposed structure

Separate by **kind**, not by topic. Topic-based folders (`features/`, `audits/`)
are why historical and current material got mixed in the first place.

```
docs/
  README.md              index with trust ratings (exists as of PR #20)
  <canonical>.md         the small set that describes how things work NOW
  specs/                 work in flight (unchanged, already correct)
  dev/                   the kit itself: how we work (unchanged)
  archive/               historical records, dated, never routed to an agent
    audits/              the June and August audits
    <retired>.md         roadmap.md, progress.md, and friends
  business/              client-facing and non-code material, never routed
```

The canonical set should end up **small, roughly eight to twelve files.** If it
grows past that, something historical has leaked back in.

## Stated assumptions, confirm or correct these when you approve

These are judgment calls made to avoid blocking. Say so if any is wrong.

1. **Historical records are archived, not deleted.** They are the audit trail, and
   the assessment itself is one of them. Archiving neutralizes the danger without
   losing the record.
2. **The six ACTIVELY MISLEADING docs move to `archive/` in this work, with a header saying what is wrong.**
   This decouples DOC-5 from DOC-3: the
   danger is neutralized immediately by relocation, and DOC-3 can fix and promote
   any of them back later if worth it. Leaving a misleading doc in the canonical
   folder while waiting for DOC-3 is the one outcome to avoid.
3. **Business material stays in the repo under `business/`, excluded from agent routing.**
   Some of it is real product input, for example
   `pro-moves-library-2026-06-25.csv` and `patient-journey-source.md`. Moving it
   to a separate repo is defensible but is a bigger change and not required to fix
   the agent-behavior problem.
4. **Both `docs/dev/` and `docs/specs/` stay as they are.**
   Both are already kind-based and already correct.

## The part most likely to break something

`.claude/skills/_shared/doc-routing.md` names eight doc paths and is what every
agent reads to decide which docs to load.

**If paths move and that table is not updated in the same PR, every agent silently reads the wrong set, or nothing.**

That is a worse state than today, because it fails quietly.

`CLAUDE.md` references nine doc paths. The assessment, every spec, and 37 Motion
tickets reference more. Path changes are not free.

**Mitigation:** the builder greps for every `docs/` path reference across the repo
before moving anything, and updates them in the same commit. A verification step
confirms no dangling reference remains.

## Acceptance script

Written for John.

1. Run `glow -t docs/`. Expect a short list at the top level, roughly eight to
   twelve files, all of which are about how the system works today.
2. Open `docs/README.md`. Expect the index to match the new structure, with no
   entry pointing at a path that no longer exists.
3. Open `docs/archive/`. Expect the audits, `roadmap.md`, `progress.md` and the
   other historical records, each carrying a header saying it is a record of the
   past and not a description of the present.
4. Confirm no doc anywhere still claims to be current when it is not. Specifically
   check that `progress.md` no longer says "Read this at the start of every new
   session."
5. Run `npm run check`. Expect it to pass. This should touch no code, so a failure
   means something unintended was moved.
6. Search the repo for any reference to a doc path that no longer exists. Expect
   zero results. The builder should provide the command in the PR.

## Personas to test as

Not applicable. No runtime code changes.

## Out of scope

- **Fixing the content of any doc.** That is DOC-3. This ticket relocates and
  labels. The one exception is adding an archive header, which is labelling.
- Moving business material to a separate repository. See assumption 3.
- Rewriting `architecture.md` or regenerating any stale doc. DOC-3.
- Touching `CLAUDE.md` content beyond correcting doc paths. The guard hook blocks
  CLAUDE.md edits by design, so path corrections there need John to apply them or
  an explicit exception.

## DB impact

None.

## Docs the builder must read

- `docs/README.md` (the inventory, from PR #20) for the trust rating of every file
- `docs/dev/assessment-2026-08-18.md`, pass 9 findings and the provenance section
- `.claude/skills/_shared/doc-routing.md`, the thing most likely to break
- `CLAUDE.md`, for its nine doc references

## Ticket breakdown

| # | Step | Depends on |
|---|------|-----------|
| 1 | Inventory every `docs/` path reference across the repo, `.claude/`, and CLAUDE.md | PR #20 merged |
| 2 | Agree the canonical set (the 8-12 that stay at top level) | 1 |
| 3 | Create `archive/` and `business/`, move files, add archive headers | 2 |
| 4 | Update `doc-routing.md` and every other reference in the same commit | 3 |
| 5 | Update `docs/README.md` to match | 3 |
| 6 | Verify zero dangling references, `npm run check` passes | 4, 5 |
| 7 | Flag the CLAUDE.md path edits for John, since the guard hook blocks them | 4 |

## Known risk

This is a large mechanical change to files that everything else references, done
by an agent, on a repo whose test coverage does not extend to documentation. The
failure mode is quiet: a moved file and a stale pointer produce an agent that
reads nothing and does not complain. Step 6 exists specifically to catch that, and
it should be treated as the real acceptance gate rather than a formality.

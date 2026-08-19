# /spec <one-line ask>

Gate 1. Interviews briefly, writes a spec, creates a Motion ticket, and STOPS
for John's approval.

## When to use

When John describes a new feature, change, or improvement and it needs planning
before building.

## What this skill does

1. **Ask up to 3 clarifying questions** -- only what's needed to write the spec.
   Don't over-interview; John's initial description is usually enough for tiny
   lane work.

2. **Determine the lane**: tiny, medium, cross-cutting, or bug. See
   `docs/dev/ticket-template.md` for definitions.

3. **Read the relevant docs** from the doc-routing table at
   `.claude/skills/_shared/doc-routing.md`. Understand the current state before
   proposing changes.

4. **Write `docs/specs/<slug>.md`** containing:
   - **What and why** -- one paragraph
   - **Acceptance script** -- do X, expect Y, written for John (not a developer)
   - **Personas to test as** -- which user roles walk the script
   - **Out of scope** -- what this deliberately does NOT touch
   - **Lane** -- tiny / medium / cross-cutting
   - **DB impact** -- none, or describe the migration
   - **Docs the builder must read** -- pulled from the doc-routing table
   - For medium+ lanes: **ticket breakdown** with order and dependencies

5. **Create a Motion ticket** on the MyProMoves Dev Board with:
   - Title matching the spec
   - Description using the template from `docs/dev/ticket-template.md`
   - Labels: the appropriate `stage:backlog` + `lane:<size>`
   - If no Motion MCP is available, print the ticket details for John to create
     manually.

6. **STOP and present the spec to John for approval.** Do not build anything.
   On "approved," move the ticket to `stage:spec-approved` (or tell John to
   relabel it).

## Rules

- Runs on the session model (Fable 5, set in `.claude/settings.json`). Do not
  delegate the spec itself to a subagent. If the spec needs research first,
  delegate that to `kit-reviewer` (Opus 4.8) or `kit-scout` (Haiku) and write the
  spec yourself.
- Never start building. The spec is the deliverable.
- For tiny lane: the spec can be inline in the ticket description instead of a
  separate file. Still stop for approval.
- No em dashes in any written output.

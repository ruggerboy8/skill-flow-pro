# /build <ticket>

Builds the approved spec on an isolated branch.

## When to use

After John has approved a spec (ticket is at `stage:spec-approved`).

## What this skill does

1. **Read the spec** at the path in the ticket's `Spec:` field. Also read every
   doc listed in the spec's "Docs the builder must read" section.

2. **Cut a branch**: `feature/<slug>` for new work, `fix/<slug>` for bugs.

3. **Spawn a Sonnet subagent** with:
   - The spec
   - The doc subset named in the spec
   - The Ground rules from `docs/features/mobile-build-instructions.md`
   - Instructions to write tests for any new logic using Vitest
   - Instructions to never push to `main`

4. **The builder works through the spec**, committing per ticket section (for
   medium+ specs with a ticket breakdown). Each commit message references the
   ticket.

5. **Run `npm run check`** (typecheck + test + build). Fix anything that fails.

6. **Report back** with a summary of what was built, what was tested, and any
   open questions. Move the ticket to `stage:building` at start, then
   `stage:qa` when complete.

## Rules

- The builder is a Sonnet-class subagent, not the main session. This keeps
  cost down and lets the main session review the output.
- For tiny lane: skip the subagent, build directly in the main session.
- Never push to `main`. The branch stays local until `/ship`.
- Tests are required for new logic (pure functions, helpers, data transforms).
  UI-only changes (copy, spacing, styling) don't need tests.
- Follow all conventions in CLAUDE.md: design tokens, icon sizes, font sizes,
  no hardcoded colors, no em dashes.

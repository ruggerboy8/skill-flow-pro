# /repro <symptom>

Bug lane entry point. Reproduces first, then hands to `/build`.

## When to use

When John reports a bug or unexpected behavior in production.

## What this skill does

1. **Understand the symptom.** Ask John:
   - Which account / persona saw it?
   - Which screen / page?
   - What did they do, and what happened vs. what should have happened?

2. **Reproduce the bug in code.** Trace the failing path through the codebase.
   Identify the root cause or narrow it to 2-3 candidates.

3. **Write a failing test** (preferred) or a documented manual repro:
   - Failing test: a Vitest test that demonstrates the broken behavior, marked
     with a comment explaining what it proves. This test should fail now and
     pass after the fix.
   - Manual repro: if the bug is in UI/data interaction that can't be unit
     tested, write a step-by-step repro doc instead.

4. **Create a ticket** on the MyProMoves Dev Board:
   - Lane: `bug`
   - Description using the template from `docs/dev/ticket-template.md`
   - Attach the failing test or repro doc
   - Acceptance script: the repro steps + "expect the correct behavior"

5. **Hand off to `/build`** with the ticket. The fix must make the failing test
   pass (red to green).

## Rules

- Never "I read the code and believe it's fixed." Reproduce first, always.
- Read the relevant docs from `.claude/skills/_shared/doc-routing.md` to
  understand the area before diagnosing.
- No em dashes in any written output.

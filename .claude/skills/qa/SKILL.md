# /qa <ticket>

Gate 2 prep. A fresh agent reviews the build against the acceptance script.

## When to use

After `/build` reports complete (ticket is at `stage:qa`).

## What this skill does

1. **Read the spec and acceptance script** from the ticket.

2. **Spawn a FRESH subagent** -- never the same agent that built it. This is the
   whole point: a clean perspective catches what the builder's assumptions miss.

3. **The QA agent walks three angles:**

   **a) Acceptance script** -- does the build meet every item in the spec's
   acceptance script? Pass/fail per item.

   **b) Adversarial ("try to break it")** -- for medium+ lanes only. Edge cases,
   unexpected inputs, role mismatches, empty states, rapid interactions.

   **c) Regression walk** -- for medium+ lanes only. Check adjacent routes and
   surfaces that share code with the changed area. Does anything else look
   broken?

4. **Produce a report** with:
   - Pass/fail per acceptance item
   - Any issues found in adversarial/regression passes
   - A "not verifiable in code" list -- things that can only be checked in the
     Lovable preview (visual layout, real data behavior, mobile feel). This
     becomes John's test plan.

5. **Post the verdict:**
   - On pass: move ticket to `stage:ready-to-review`
   - On fail: move ticket back to `stage:building` with the failure report

## Rules

- Model: Sonnet for tiny/medium, Opus for cross-cutting.
- The QA agent must NOT be the builder. Use a fresh subagent.
- QA is code-level review + logic verification. It cannot test against real data
  or verify visual appearance -- those go in the "not verifiable" list for John.
- No em dashes in the report.

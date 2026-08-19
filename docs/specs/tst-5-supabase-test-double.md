# Spec: TST-5, a Supabase test double

**Status:** awaiting John's approval (Gate 1)
**Created:** 2026-08-18
**Lane:** medium
**Ticket:** TST-5

## What and why

Nothing in this codebase that talks to the database can be unit tested, because
the Supabase client is a single hardcoded module-level constant with no seam to
substitute a fake. 187 of 421 source files import it. This spec adds a test
double so those files become testable, and proves it works on one real function.

## A correction to the ticket's own premise

TST-5's ticket says it "unblocks testing everywhere else." The inventory shows
that is only half true, and the half that is wrong matters for sequencing.

**Four of the functions the test tickets target are already pure and need no
double at all:**

| File | Supabase calls | Needed by |
|---|---|---|
| `src/lib/submissionPolicy.ts` | none | COR-1 |
| `src/lib/evaluationEligibility.ts` | none | TST-1 |
| `src/lib/submissionStatus.ts` | none | TST-1 |
| `src/lib/recommenderUtils.ts` | none | TST-2 |

**So TST-1 and TST-2 are not blocked by this ticket and can be worked
immediately.** What TST-5 actually unblocks is `locationState.ts` (TST-3), the
hooks, and everything else that queries the database. That is still most of the
codebase, so the ticket is worth doing. It just should not hold up the two
cheapest test tickets on the board.

## The measured surface a fake has to cover

From a full inventory of `src/`:

- 721 `.from(...)`, 489 `.select(...)`, 82 `.update(...)`, 63 `.delete(...)`,
  47 `.insert(...)`, 15 `.upsert(...)`
- Modifiers, by frequency: `.eq` 695, `.in` 141, `.order` 134, `.maybeSingle` 99,
  `.single` 52, `.limit` 30, `.is` 30, `.not` 20, `.or` 8, `.gte` 5, `.ilike` 5,
  `.match` 5, `.lt` 3, `.neq` 3, `.contains` 2, `.lte` 2, `.range` 0
- 56 `.rpc(...)` calls across 31 distinct functions
- `.auth.` 26 calls, `.storage.` 7 calls, `.channel(` 1 call

The long tail is thin. Nine modifiers cover the overwhelming majority.

## Approach

**Use `vi.mock` against the client module, with a chainable fake. Do not change
production code.**

The alternative, refactoring `client.ts` into an injectable factory, would touch a
module imported by 187 files to serve tests only. That is a large blast radius for
no runtime benefit, and this codebase does not currently have the test coverage to
catch a mistake in it. Rejected deliberately.

The fake is a **recorder and canned-response object, not a query engine.** It
accepts any chain of the supported modifiers, records what was asked for, and
returns whatever the test told it to return. It does not filter, sort, or join.
A test that needs filtered data supplies the already-filtered rows.

This is the important scoping decision. Building something that actually
evaluates `.eq()` against in-memory rows is a database, and writing a database to
test an app is how this ticket turns into a month.

## Scope

**In:**
- A `src/test/supabaseMock.ts` helper exporting a fake client plus a way for a
  test to queue responses per table or per RPC name
- Chain support for: `from`, `select`, `insert`, `update`, `upsert`, `delete`,
  `eq`, `in`, `order`, `single`, `maybeSingle`, `limit`, `is`, `not`, `or`, `gte`,
  `lte`, `ilike`, and `rpc`
- Awaitable at any point in the chain, returning `{ data, error }` in the shape
  the real client uses
- Assertion helpers so a test can check which table was queried and with what
- `vitest.config.ts` gains a `setupFiles` entry pointing at a setup module
- A short section in the repo docs so the next person finds it

**Out:**
- `.auth.*` (26 calls), `.storage.*` (7 calls), `.channel(` (1 call). Add them
  when a test actually needs them; stubbing them now is speculative.
- Any real filtering, sorting or join evaluation
- Refactoring `client.ts`
- Standing up a non-production Supabase project. That is separate, larger, and
  **blocked on GOV-1**, since a database rebuilt from a repo missing eight
  migrations would disagree with production in security-relevant ways.
- Writing the tests for TST-1 through TST-4. This ticket delivers the tool and
  one proof.

## The proof target

`src/lib/locationState.ts`, function `getLocationWeekContext`.

Chosen because it is the single densest Supabase consumer found: 8 or more
distinct queries across `locations`, `practice_groups`, `weekly_assignments`,
`staff`, `weekly_scores`, `excused_submissions` and `excused_locations`, using
`.select`, `.eq`, `.or`, `.order`, `.maybeSingle` and nested-select joins. If the
fake can carry this function, it can carry most of the codebase.

It is also directly useful: this is the week and cycle math TST-3 needs to test,
and it currently has zero tests despite running for every staff member every day.

## Acceptance script

Written for John. Nothing user-facing changes.

1. Run `npm run check`. Expect it to pass, with more than one test file now.
2. Open `src/test/supabaseMock.ts`. Expect a short file you can skim, with a
   comment at the top saying plainly what it does and what it deliberately does
   not do.
3. Open the new test for `getLocationWeekContext`. Expect to see canned database
   rows going in and an expected week and cycle coming out, readable without
   knowing the Supabase API.
4. Run `git status`. Expect changes only under `src/test/`, one new test file,
   `vitest.config.ts`, and a doc. **No changes to `src/integrations/`, no changes
   to any component or page, no migrations.**
5. Deliberately break it: change a number in the week math in `locationState.ts`,
   re-run `npm run check`, and expect a failing test that names what broke.
   Then undo the change.

Step 5 is the one that matters. A test that cannot fail is not a test.

## Personas to test as

Not applicable. No runtime code changes and nothing user-facing.

## DB impact

None. This ticket exists specifically to avoid needing a database.

## Docs the builder must read

- `docs/system-overview.md` for the weekly loop `locationState.ts` implements
- `docs/glossary.md` for cycle, week-in-cycle, check-in and check-out
- `CLAUDE.md` design system and writing conventions, no em dashes
- `.claude/skills/_shared/model-tiering.md` for which agent does what

## Ticket breakdown

| # | Step | Depends on |
|---|---|---|
| 1 | Write `src/test/supabaseMock.ts` with the chainable fake | spec approval |
| 2 | Wire `setupFiles` in `vitest.config.ts` | 1 |
| 3 | Write the `getLocationWeekContext` test using the fake | 1, 2 |
| 4 | Confirm the deliberate-break check in acceptance step 5 | 3 |
| 5 | Document it so the next person finds it | 3 |

## Known risk

The fake returns canned data, so a test proves the function's logic given
believable inputs. It does not prove the query itself is correct against the real
schema. A test can pass while the underlying query selects a column that does not
exist. That gap is real and is what a non-production Supabase would close later.
Worth stating plainly so nobody reads green tests as more assurance than they are.

# Lint policy (GOV-4)

Plain-language record of what changed in the lint setup, why, and the numbers
before and after. This is the ticket that turned `npm run lint` from "nobody
runs it" into "CI blocks a PR that adds a new lint error."

## What was wrong

`eslint.config.js` only ignored `dist`. Two problems came from that:

1. This repo uses git worktrees under `.claude/worktrees/` so multiple agents
   can work on different branches at once. Each worktree is a full copy of
   the repo. Because nothing told eslint to skip that folder, it was linting
   every file in every one of those copies as if it were this repo's own
   source. That's why a whole-repo lint run reported **2,909 problems**: most
   of that was the same handful of real issues, counted again and again, once
   per abandoned worktree.
2. Even with that noise removed, the real `src/` debt was large: 693
   problems (607 errors, 86 warnings), and it was never run in CI, so nobody
   saw it and nothing stopped it from growing.

## What changed

### 1. Stopped linting non-source directories

`eslint.config.js` now ignores `dist`, `.claude`, and `supabase/.temp` (the
Supabase CLI's local scratch folder, if it exists). The worktrees themselves
are untouched, only excluded from linting. Other agents still use that
directory normally.

### 2. Tuned which rules block a PR and which just warn

The debt was concentrated in a few rules. Each one got a deliberate decision,
written here and as a comment block at the top of `eslint.config.js`:

| Rule | Decision | Why |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | error → **warn** | 587 of the 607 `src/` errors (96%) were this one rule. Fixing it means writing real types for Supabase query results, form payloads, and API responses across the app. That's a real engineering project on its own, not something a lint-config ticket should mass-fix. Warn keeps every instance visible in CI without blocking merges. |
| `@typescript-eslint/no-require-imports` | error → **warn** | 3 hits, all `require()` calls loading Tailwind plugins in `tailwind.config.ts` and `tailwind.config.backup.ts`. Rewriting those as static imports touches build config and could change how PostCSS/Tailwind resolves those plugins at build time. Out of scope here, left visible as a warning instead. |
| `react-hooks/exhaustive-deps` | left as **warn** (already the plugin's default before this ticket) | 65 warnings, each one a `useEffect`/`useMemo` dependency array that's missing something. Fixing these can change *when* an effect re-runs, which is a real behavior change, not a lint fix. That cleanup is its own ticket, done one effect at a time with testing. Not touched here. |
| `react-refresh/only-export-components` | left as **warn** (already the case before this ticket) | 19 warnings. Several files (especially `src/components/ui/*`) intentionally export a constant or helper function alongside a component. Splitting every one of those into a separate file is a structural change, not a lint fix. Stays a visible warning. |
| `@typescript-eslint/no-unused-expressions` | **fixed** (5 spots) | `cond ? a() : b()` and `cond && fn()` used only for their side effect. Rewritten as `if`/`else`. Same runtime behavior, now a valid statement instead of an expression eslint can't make sense of. |
| `@typescript-eslint/no-empty-object-type` | **fixed** (2 spots) | `interface X extends Y {}` with no added members. Changed to `type X = Y`. Purely a type-level change, erased at compile time, no runtime difference. |
| `@typescript-eslint/no-non-null-asserted-optional-chain` | **fixed** (1 spot) | `user?.id!` combines "this might not exist" with "trust me, it does," which defeats the type check without changing behavior. Rewritten to keep the same runtime value without the unsafe assertion pattern. |
| `prefer-const` | **fixed** (13 spots) | Variables declared with `let` that were never reassigned. Mechanical, zero behavior change, real error-level rule from the TypeScript-eslint recommended config. Not called out in the original ticket estimate but found during this pass, so fixed alongside the other small errors rather than left as debt. |

No rule was turned off entirely. Everything downgraded to warn still shows up
in every `npm run lint` and every CI run, it just doesn't fail the build.

### 3. Added lint to the safety net

- `npm run check` now runs `tsc --noEmit`, **`npm run lint`**, `vitest run`,
  then `vite build`, in that order.
- `.github/workflows/ci.yml` now runs `npm run lint` as its own step, after
  the typecheck and before the tests.
- Both fail the run if lint reports any **error**. Warnings do not fail
  anything. That is the whole point of downgrading the debt rules to warn
  instead of turning them off: the debt stays visible, but it doesn't block
  people from shipping unrelated work.

## Numbers

| Measurement | Problems | Errors | Warnings |
|---|---|---|---|
| Whole repo, before (`.claude` worktrees included, original ignore config) | 2,909 | n/a | n/a |
| `src/` only, before (ticket's baseline) | 693 | 607 | 86 |
| This worktree, before (no nested worktrees present, original rules) | 850 | 764 | 86 |
| This worktree, after ignore fix + rule tuning + hand fixes | 829 | **0** | 829 |

The "whole repo, before" number came from a checkout that had other agents'
abandoned worktrees under `.claude/worktrees/`, which is why it's so much
bigger than everything else in this table. Once `.claude` is ignored, that
inflation goes away for good, every future lint run only reports on this
repo's own files.

## Proof the gate actually blocks something

To confirm this isn't just numbers on paper: an intentional lint error (an
unused expression, the same class of bug this ticket fixed by hand elsewhere)
was added to `src/lib/evaluations.ts`, `npm run lint` was run and confirmed
to exit with a non-zero status (fails), then the intentional error was
removed and `npm run lint` was confirmed to exit 0 again. Same check applies
in CI: a PR that introduces a new lint **error** will fail the `lint` step
and block the merge. A PR that only adds a new `any` or a new missing
dependency array (the rules left at warn) will pass, the warning will just
show up in the CI log for a human to notice.

## What this ticket did not do

- Did not fix any of the 587+ `no-explicit-any` warnings. That is real typing
  work across the app, tracked as separate debt, visible in every lint run.
- Did not fix any of the 65 `react-hooks/exhaustive-deps` warnings. Doing
  that changes when effects re-run, which is a behavior change that needs
  its own ticket and testing, not a lint-config pass.
- Did not touch `tailwind.config.ts` or `tailwind.config.backup.ts` beyond
  downgrading the `no-require-imports` rule. Rewriting those files' plugin
  loading was judged outside this ticket's scope.
- Did not delete any git worktree. `.claude/worktrees/` is excluded from
  linting only, the folder and its contents are untouched.

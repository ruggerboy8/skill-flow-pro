# /status

Prints what's in flight on the dev board.

## When to use

When John asks "where are we" or wants a snapshot of active work.

## What this skill does

1. **Check for open PRs** via `gh pr list`.

2. **Check local branches** via `git branch` to see what's in progress.

3. **Print a summary table:**

   ```
   | Ticket | Stage | Branch | PR | Notes |
   |--------|-------|--------|----|-------|
   ```

4. If a Motion MCP is available, read the board for richer status. Otherwise,
   reconstruct from git and GitHub state.

5. **Sync the board to GitHub (added 2026-08-19).** GitHub is the source of
   truth for merge state; the board drifts because John merges on GitHub and
   nobody touches Motion. Every PR title starts with its ticket code
   (`COR-1:`, `BUG-1:`), so match on that and correct the stage label:

   | GitHub state of the ticket's PR | Stage label to set |
   |---|---|
   | PR open, CI green or pending | `stage:ready-to-review` |
   | PR merged | `stage:merged` |
   | PR closed without merge | leave as is, mention it in the output |

   Rules for the sync: only move a label FORWARD (never demote `merged` or
   `published`); never set `stage:published` (only John knows when he hit
   Publish in Lovable); only touch tickets whose code appears in a PR title;
   keep every other label on the task. Use `gh pr list --state all --limit 50
   --json number,title,state,mergedAt` and the Motion `update` operation with
   the task's current labels, swapping just the stage one. Print what changed
   as a short list under the table, e.g. "Board synced: COR-1 → merged,
   DOC-5 → ready-to-review".

## Rules

- Read-only for code and git. The only thing this skill changes is Motion
  stage labels, per step 5, and only forward.
- Keep the output short and scannable.
- No em dashes.

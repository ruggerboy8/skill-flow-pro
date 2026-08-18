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

## Rules

- Read-only. This skill never changes anything.
- Keep the output short and scannable.
- No em dashes.

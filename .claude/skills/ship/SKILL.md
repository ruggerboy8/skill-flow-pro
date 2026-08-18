# /ship <ticket>

Pushes the branch, opens a PR, and prints John's checklist. Never merges.

## When to use

After `/qa` passes (ticket is at `stage:ready-to-review`).

## What this skill does

1. **Run `npm run check`** one final time. If it fails, fix before proceeding.

2. **Push the branch** to GitHub.

3. **Open a PR** with:
   - Title matching the ticket
   - Body containing:
     - Link to the spec
     - Build summary (what changed and why, in plain language)
     - QA report (pass/fail per acceptance item)
     - The full acceptance script, written for John
     - DB change notes if applicable

4. **Print John's human checklist:**

   ```
   Your checklist:
   1. Read the PR description on GitHub
   2. Wait for the green CI check
   3. Switch Lovable to branch [branch-name] to preview
   4. Walk the acceptance script as [persona(s)]
   5. Switch Lovable back to main
   6. Merge the PR on GitHub
   7. Verify Lovable re-syncs main
   8. Publish
   ```

   Adjust the checklist if there's a DB change (add the apply step and its
   ordering relative to deploy).

5. **Move the ticket** to `stage:ready-to-review`. John moves it to
   `stage:merged` and `stage:published` himself.

## Rules

- Never merge. Never click Publish. Those are John's actions.
- Never push to `main`. Push to the feature/fix branch only.
- The PR description is written for John, not a developer. Outcomes, not diffs.
- No em dashes in any written output.

# Skill Flow Pro — Claude Context

## Who you're working with (added 2026-08-18)

John, the founder, is strong at product thinking, UX intent, requirements, and
describing behavior — not at reading code or CLI/git mechanics. He is actively
building that fluency (see `docs/dev-workflow-redesign.md` and
`docs/dev-workflow-kit-instructions.md`), but treat him as new to this in any
session, including ones running here in his terminal (Warp), not just the
desktop app.

Consequences for how you work with him, in this repo specifically:

- **Narrate terminal/git actions in plain language as you do them**, not just
  their names. Instead of "rebasing," say what's actually happening and why.
  Don't assume familiarity with branches, merges, PRs, or diffs — a one-clause
  reminder of what a thing is costs little and saves a derailed session.
- **Never assume he'll read a diff to verify your work.** Summarize what
  changed and why in outcomes, not code. If something needs his literal eyes
  on it, point him at the Lovable preview or a screenshot, not a `git diff`.
- **State the safety rule before a risky step**, don't just do it: pushing to
  `main`, merging, or anything that touches production data gets a plain-
  English heads-up first, even if he's technically already approved the plan.
- **Default to more explanation, not less**, when a request touches git,
  CI, deploys, or infra he hasn't worked with before. If unsure whether he
  needs the explanation, give the short version and offer to go deeper.
- He is deliberately moving toward the workflow in
  `docs/dev-workflow-kit-instructions.md` (branches, PRs, a Motion board,
  human-only merges). Reinforce that workflow's habits in how you present
  work, even before the tooling in that doc is fully built.
- If he asks a question that reveals a gap in a foundational concept, answer
  it plainly, and don't act as if it should have been obvious.

## Project overview

Skill Flow Pro is a coaching/training platform for dental practices. It was
originally built for a single pediatric DSO (Alcan) and is now being expanded
into a multi-tenant SaaS product.

## Start here — foundational docs (added 2026-06-22)

Read these before making recommendations or changes:

- `docs/system-overview.md` — what the product is, who uses it, the weekly loop
- `docs/glossary.md` — domain terms (Pro Move, check-in/out, sequencer = recommender, …)
- `docs/data-model.md` — the database as it actually exists (verified against the live DB)
- `docs/architecture.md` — codebase structure/routing/auth/roles *(⚠️ being refreshed; see banner)*
- `docs/improvement-backlog.md` — known weirdness, legacy cleanup candidates, change-mgmt practice
- `docs/audits/` — security/RLS (live-verified), code-quality, UX *(code audits flagged stale; re-run)*

## Stack

- **Frontend**: Vite + React + TypeScript, Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres, Auth, RLS, Edge Functions)
- **Package manager**: npm
- **Migrations**: 458+ migrations in `supabase/migrations/`, run via Lovable or
  `npx supabase db push`

## Supabase connection

```bash
# One-time auth (browser-based — no token in the repo):
npx supabase login
npx supabase link --project-ref yeypngaufuualdfzcjpk

# Inspect live schema:
npx supabase db diff
```

- Project ref: `yeypngaufuualdfzcjpk`
- URL: `https://yeypngaufuualdfzcjpk.supabase.co`
- Anon key is in `.env` / `src/integrations/supabase/client.ts`
- **Never commit access tokens or DB passwords to this repo.** Authenticate
  locally with `supabase login` (browser flow) instead.

**Applying migrations:** `supabase db push` does **not** work here. Lovable owns
migrations and names files `<timestamp>-<uuid>.sql` (hyphen); the CLI requires
`<timestamp>_name.sql` (underscore) and skips the hyphenated files, so the CLI's
migration history never reconciles and `db push` fails. To ship a migration,
either paste its SQL into the Supabase dashboard **SQL Editor** (write it
idempotently — `IF NOT EXISTS` / `CREATE OR REPLACE`, and apply column adds
before functions that reference them), or land it on `main` for Lovable to pick
up. The claude.ai/code sandbox can reach GitHub but not Supabase's management
API (`api.supabase.com`), so any CLI link/push/deploy must run from a local
machine.

## Data model & terminology

The canonical terms are defined in `docs/enterprise-architecture.md`. A common
source of bugs is old code using the deprecated terms.

| Term | Table | Old/deprecated term |
|---|---|---|
| Organization | `organizations` | "tenant" |
| Group | `practice_groups` | "organization", "org" |
| Location | `locations` | — |
| Staff | `staff` | — |

Hierarchy: `Organization → Group → Location → Staff`

### Key relationships added during multi-tenancy migration (2026-03-06)

- `practice_groups.organization_id` → `organizations.id` (added in migration
  `20260306190002`)
- `current_user_org_id()` SQL function resolves the calling user's org via
  `staff → locations → practice_groups`
- `resolve_role_display_name(org_id, role_id)` returns org-specific role labels
  with fallback to `roles.role_name`

### RLS dependency rule

**Any RLS policy that joins through `practice_groups.organization_id` must live
in a migration that runs _after_ `20260306190002`.** This was the root cause of
the circular dependency bug on 2026-03-06. Always check column existence before
writing cross-table policies.

## Edge functions

Defined in `supabase/functions/`. JWT verification per-function is configured in
`supabase/config.toml`. Functions with `verify_jwt = false` are public.

Key functions:
- `sequencer-rank`, `sequencer-rollover`, `sequencer-health` — pro move sequencing
- `coach-remind` — coaching reminders
- `admin-users` — user management (JWT required)
- `generate-audio`, `save-audio`, `transcribe-audio` — audio pipeline
- `extract-insights`, `format-transcript`, `format-reflection` — AI content

## Development workflow

This project is co-developed with Lovable (AI-assisted frontend). Claude Code
handles migrations, schema design, and complex logic. Lovable handles UI.

When writing migrations:
1. Read the existing schema (`npx supabase db diff` or inspect recent migrations)
2. Write migrations in dependency order — tables before FK references, columns
   before policies that reference them
3. Add a sanity-check `DO $$ ... $$` block at the end of backfill migrations
4. Migrations are numbered manually for ordering; use `YYYYMMDDHHMMSS_description.sql`

### Framework content is versioned (added 2026-07-30)

`pro_moves` and `pro_move_resources` have DB-level version capture into the
append-only `framework_history` table (see
`docs/pro-move-versioning-implementation-plan.md`). Consequences for any
migration or SQL touching those tables:

- **Start the migration with**
  `select set_config('app.change_reason', 'batch: <what and why>', true);`
  so every captured version carries attribution instead of "unrecorded (SQL)".
- **Never `DELETE` platform pro_moves** (`owner_org_id is null`): a trigger
  blocks it with a 23503 error. Retire instead (`active = false`,
  `retired_at = now()`). Org-owned rows are exempt (org teardown).
- Updates that only touch `curriculum_priority*`, `updated_at/by`, or the
  vestigial `status`/`version`/`date_added` columns produce no version rows.
- After a meaningful editing milestone, cut a release:
  `select create_framework_release('<role>-YYYY.MM', <role_id>, '<notes>');`

## Design system conventions

### Icon sizes

Use consistent icon sizing based on context:

| Context | Size | Tailwind class |
|---|---|---|
| Inline with text (labels, badges, list items) | 16px | `h-4 w-4` |
| Standalone / buttons / interactive | 20px | `h-5 w-5` |
| Section headers / empty states | 24px | `h-6 w-6` |
| Page-level headers | 32px | `h-8 w-8` |

### Font sizes

- Use `text-2xs` (0.625rem / 10px) for micro-labels, timestamps, and metadata.
  Do **not** use `text-[10px]`.

### Colors

- **Domain colors**: Use `getDomainColor()` / `getDomainColorRich()` from
  `src/lib/domainColors.ts`. CSS vars: `--domain-clinical`, `--domain-clerical`,
  `--domain-cultural`, `--domain-case-acceptance` (plus `-pastel` variants).
- **Score colors** (1–4 scale): `--score-1` through `--score-4` (plus `-bg` variants).
- **Status colors**: `--status-complete`, `--status-missing`, `--status-late`,
  `--status-excused`, `--status-pending` (plus `-bg` variants).
  Use `<StatusBadge />` from `src/components/ui/StatusBadge.tsx`.
- **Win banner**: `--win-growth`, `--win-perfect` (plus `-bg`, `-border` variants).
- Never hardcode Tailwind color classes (e.g. `bg-emerald-100`) for semantic
  states — always use CSS custom properties or token helpers.

# Skill Flow Pro — Claude Context

## Project overview

Skill Flow Pro is a coaching/training platform for dental practices. It was
originally built for a single pediatric DSO (Alcan) and is now being expanded
into a multi-tenant SaaS product.

## Stack

- **Frontend**: Vite + React + TypeScript, Tailwind + shadcn/ui
- **Backend**: Supabase (Postgres, Auth, RLS, Edge Functions)
- **Package manager**: npm
- **Migrations**: 458+ migrations in `supabase/migrations/`, run via Lovable or
  `npx supabase db push`

## Supabase connection

```bash
# One-time link (run from project root):
SUPABASE_ACCESS_TOKEN="sbp_ba76378959b1c92466fb8d0d27af9bfc2c983829" \
  npx supabase link --project-ref yeypngaufuualdfzcjpk

# Inspect live schema:
npx supabase db diff

# Push pending migrations:
npx supabase db push
```

- Project ref: `yeypngaufuualdfzcjpk`
- URL: `https://yeypngaufuualdfzcjpk.supabase.co`
- Anon key is in `.env` / `src/integrations/supabase/client.ts`

**Note:** The Claude Code sandbox (claude.ai/code tab) has no outbound internet.
Run `supabase` commands from your local machine or use `npx supabase db diff`
after linking to validate migrations.

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

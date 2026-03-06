# Skill Flow Pro - Project Memory

## Project Overview
Multi-tenant SaaS coaching platform for dental practices.
- Repo: ~/skill-flow-pro (also at GitHub: ruggerboy8/skill-flow-pro)
- Supabase project ref: yeypngaufuualdfzcjpk
- Stack: Vite + React + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Auth, RLS, Edge Functions)
- No CLAUDE.md exists — docs are in /docs/ folder

## Key Docs
- docs/weekly-assignments-migration-summary.md — migration history
- docs/phase-3-5-implementation-plan.md — roadmap for weekly_assignments transition
- docs/phase2-qa.md — feature flag QA doc
- docs/edge-function-deployment.md — edge function deploy notes

## Architecture

### Data Model (Terminology)
- **weekly_assignments** — unified assignment table (current system, replaces weekly_focus)
  - assignment_id format: `assign:<uuid>`
  - priority: location_id > org_id > global (source='global')
  - status: 'proposed', 'locked', 'active'
  - source: 'global', 'org', 'onboarding'
- **weekly_scores** — links via assignment_id (`assign:<uuid>`) + legacy weekly_focus_id
- **weekly_focus** — DEPRECATED (C1-C3 templates only, do not use for new features)
- **weekly_plan** — DEPRECATED (only 2025-12-01 kept)
- **locations** — dental practice locations, has program_start_date, onboarding_active
- **pro_moves** (action_id reference) — skill actions
- **competencies** — competency areas

### User Roles
- Staff (onboarding dental staff) — submit confidence/performance scores
- Coach — view roster, staff detail, reminders
- Admin — global settings, org/location management, assignment building
- Doctor — clinical-side user journey

### Key Hooks
- src/hooks/useWeeklyAssignments.tsx — main assignment fetch hook
- src/hooks/useReliableSubmission.tsx — score submission
- src/hooks/useMyWeeklyScores.tsx — staff score loading
- src/hooks/useStaffWeeklyScores.tsx — coach view of staff scores

### Key Pages
- src/pages/Confidence.tsx, Performance.tsx — staff submission
- src/pages/coach/StaffDetailV2.tsx — coach staff detail
- src/pages/coach/CoachDashboardV2.tsx — coach dashboard
- src/pages/planner/PlannerPage.tsx — assignment planning (AI-powered)
- src/components/admin/GlobalAssignmentBuilder.tsx — admin assignment builder

### Feature Flags
- src/lib/featureFlags.ts — VITE_USE_WEEKLY_ASSIGNMENTS (was used during migration, now off)

## Migration Status
- weekly_assignments migration: COMPLETE as of 2025-11-21
- All RPCs updated to use weekly_assignments exclusively
- Frontend updated: useWeeklyAssignments, Confidence, Performance, CoachDetail
- SimpleFocusBuilder shows deprecation warning
- GlobalAssignmentBuilder is the new builder

## Supabase Connection
- Project ref: yeypngaufuualdfzcjpk (ACTIVE_HEALTHY, us-west-1)
- MCP tool available: use mcp__35b945bc-362a-4ed5-8fa7-fe46f4317958__execute_sql / apply_migration
- Gen types: npx supabase gen types typescript --project-id yeypngaufuualdfzcjpk > src/integrations/supabase/types.ts
- User NEVER runs SQL — Claude Code handles all DB operations directly

## Database State (as of Session 2, 2026-03-06)
- organizations table: EXISTS, Alcan backfilled (id: a1ca0000-..., slug: alcan)
- practice_groups.organization_id: EXISTS, all 6 groups linked to Alcan
- user_capabilities: NOT YET BUILT
- organization_pro_move_overrides: NOT YET BUILT

## Branches
- main: live Alcan app — never touch directly
- claude/codebase-assessment-hq6Pn: Session 1 work (arch docs + terminology + org migration) — NOT merged to main
- claude/ecstatic-ptolemy: current working branch

## Tracking Doc
- docs/progress.md in the worktree — master reference for status and decisions
- Update at end of every session

## Open Design Question (Session 2)
- Super-admin view: Option A (separate /platform-admin page) vs Option B (org switcher/masquerade)
- Awaiting user decision before building

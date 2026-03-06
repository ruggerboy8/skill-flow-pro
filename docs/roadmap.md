# Skill Flow Pro — Product Roadmap & Session Log
*Living document. Updated at the end of every working session.*
*Owner: ruggerboy8 | Technical partner: Claude Code*

---

## Session Log

### Session 1 — 2026-03-06
**Duration:** ~2 hrs (planning + design)
**Branch:** `claude/codebase-assessment-hq6Pn`

**Accomplished:**
- Full codebase assessment (330 files, ~68K LOC)
- Established 3-bucket framework for all work
- Agreed on sequencing: Enterprise architecture first, then doctor features, then polish
- Designed multi-tenant architecture (docs/enterprise-architecture.md)
  - Organization = tenant (top level)
  - Group = sub-grouping of locations (previously called "organization")
  - Location = individual practice
- Terminology audit: found and fixed remnants from Lovable's incomplete rename
  - Migration: `admin_audit.scope_organization_id` → `scope_group_id`
  - Fixed: `StaffDetailV2`, `AdminUsersTab`, `EvaluationsExportTab`, `types.ts`
- Identified SaaS feature gaps and added to roadmap
- Established workflow: Claude Code writes → branch pushed → preview in Lovable → merge to main

**Deferred (intentional):**
- `isOrgAdmin` / `managedOrgIds` rename in `useUserRole` — left for full permissions refactor
- All implementation (this session was planning only)

**Estimated pace reference:**
- Planning session with no prior context: ~2 hrs to produce architecture doc + terminology cleanup
- Next sessions will move faster since context is established

---

## Terminology Reference (Locked)

| Term | Meaning | DB table |
|---|---|---|
| **Organization** | The tenant — top-level contracting entity (DSO, practice group, single practice) | `organizations` (to be created) |
| **Group** | Sub-grouping of locations within an org | `practice_groups` (existing) |
| **Location** | Individual practice/office | `locations` (existing) |
| **Staff** | Any user of the platform | `staff` (existing) |

---

## Work Queue

Items are ordered by the agreed sequencing. Each item shows status, estimated
session count, and any blockers.

---

### TIER 1 — Enterprise Foundation (Do First)
*These unblock everything else. Build the right foundation before adding features.*

#### [IN PROGRESS] 3a. Enterprise Architecture Design
- Architecture document: ✅ Done (`docs/enterprise-architecture.md`)
- Terminology cleanup: ✅ Done
- Open decisions resolved: ✅ All 4 answered

#### [ ] 3b. Tenant Schema Implementation
**Estimated:** 1–2 sessions
**What it is:** The database and app changes that make multi-tenancy real.
- New `organizations` table (tenant layer)
- Add `organization_id` FK to `practice_groups`
- Row-Level Security (RLS) policies scoped to organization
- Backfill Alcan as the first organization
- Update app to read organization context
- Organization onboarding flow (invite org admin, set up env)

#### [ ] 3c. Pro Move Library — Two-Layer System
**Estimated:** 1 session
**What it is:** Platform library (us) + per-org visibility control (tenant).
- Add `practice_type` to `pro_moves` table
- New `organization_pro_move_overrides` table
- Admin UI for org admins to show/hide pro moves
- Starter pack seeding when a new org is created

#### [ ] 3d. Granular Permissions Refactor
**Estimated:** 2 sessions
**What it is:** Replace boolean flag system with capability toggles.
- New `user_capabilities` table
- Backfill from existing `is_coach`, `is_org_admin`, etc. flags
- Update `useUserRole` hook (rename `isOrgAdmin` → proper new name here)
- New user creation flow: participant vs. non-participant → capability toggles
- Location/group scoping via `coach_scopes` (already exists, just document)

#### [ ] 3e. UK/Timezone Fix
**Estimated:** 1 session
**Blocker for UK launch.**
- Audit all usages of `lib/centralTime.ts`
- Replace hardcoded Central Time with location-level timezone
- Fix week boundary / Monday rollover logic
- Test against UK timezone scenarios

---

### TIER 2 — Doctor & Clinical Features (Build on Enterprise Foundation)
*These should be built after the org/permissions layer is stable.*

#### [ ] 2a. Doctor Feature Design
**Estimated:** 1 session (planning only)
**What it is:** Define how the doctor workflow differs from staff.
- Looser cadence (not weekly — facilitated by clinical director)
- What data does a doctor track vs. what gets assessed about them?
- Clinical director's role in managing doctor development
- Multi-doctor management (not just one doctor per org)
- Evaluation structure for doctors

#### [ ] 2b. Doctor Feature Build
**Estimated:** 2–3 sessions
**What it is:** Implement the designed doctor workflow.
- Doctor dashboard (currently isolated and incomplete)
- Clinical director tools for managing multiple doctors
- Doctor-specific pro move or competency structure (TBD in design)
- Evaluation flow adapted for doctor cadence

---

### TIER 3 — Codebase Polish & Security
*Safe to do at any time. Prioritize items that don't depend on the enterprise schema.*

#### [ ] 1a. Quick Wins Cleanup
**Estimated:** 1 session
**Safe to do now (independent of enterprise schema):**
- Delete backup files (`*.backup.tsx` — button, card, index)
- TypeScript config: enable `strictNullChecks` (will surface real bugs to fix)
- Generic loading states → proper loading + error states in key components
- Add basic retry logic for failed Supabase queries

#### [ ] 1b. Security & RLS Audit
**Estimated:** 1 session
**After tenant schema is in place (RLS will be rewritten anyway):**
- Audit all RLS policies for completeness
- Verify no cross-tenant data leakage possible
- Input validation review (forms, edge functions)
- Confirm Supabase anon key is only used where appropriate

#### [ ] 1c. Pagination
**Estimated:** 1 session
**After enterprise schema (data volume grows with multiple orgs):**
- Eval results table
- Staff list in admin
- Coach dashboard staff list

---

### TIER 4 — Standard SaaS Features
*These improve the product significantly but aren't blockers for enterprise launch.*

#### [ ] S1. GDPR Compliance (P0 for UK launch)
- Right to erasure: delete user + all their data
- Data export on request (user's own data as JSON/CSV)
- Data retention policy (configurable per org, auto-delete after X years)
- Terms of service acceptance on first login
- Privacy policy flow for org signup

#### [ ] S2. Email Notification System (P1)
- Deadline reminders (weekly submission due)
- Evaluation assignment notification
- Coach feedback received
- Onboarding welcome email sequence

#### [ ] S3. In-App Notification Center (P1)
- Bell icon with unread count
- Feed: "pending evaluation," "coach left feedback," "new assignment"
- Mark as read / clear all

#### [ ] S4. Org Admin Dashboard (P1)
- See who has/hasn't logged in recently
- Submission rate overview across org
- Onboarding completion status per staff member

#### [ ] S5. Data Export (P1)
- Org admin can export staff data, submission history, eval results as CSV
- Platform admin can export across orgs

#### [ ] S6. Bulk User Import (P2)
- CSV upload: email, name, role, location
- Validation report before import executes
- Send invite emails to all imported users

---

### TIER 5 — Future / Backlog
*Good ideas, not yet scoped or sequenced.*

- Pro move language customization with LLM review (per-org content editing)
- AI-assisted pro move suggestions based on evaluation patterns
- SSO/SAML for enterprise login
- API access for integration with practice management systems
- Audit log UI for org admins
- In-app change log ("What's new")
- Mobile-optimized views (currently desktop-first)

---

## Key Decisions Made (Don't Re-Litigate)

| Decision | What was decided | Date |
|---|---|---|
| Work sequencing | Enterprise → Doctor features → Polish | 2026-03-06 |
| Tenant terminology | "Organization" = tenant, "Group" = sub-grouping | 2026-03-06 |
| Practice type location | On Organization (tenant), not Group or Location | 2026-03-06 |
| Mixed practice types | Not supported Phase 1 — revisit if real use case emerges | 2026-03-06 |
| Group-level admin | Handled by scoped capability toggles, no separate role needed | 2026-03-06 |
| Phase 1 pro move customization | Visibility only (show/hide) — no content editing yet | 2026-03-06 |
| Bulk user import | P2 — email invite is primary onboarding path for Phase 1 | 2026-03-06 |
| UK timezone | Must fix before UK launch — location-level timezone replaces Central Time hardcode | 2026-03-06 |
| Tooling | Claude Code for implementation, Lovable for branch preview and final merge | 2026-03-06 |

---

## Branch Reference

| Branch | Purpose | Status |
|---|---|---|
| `main` | Live app (Alcan production) | Always protected |
| `claude/codebase-assessment-hq6Pn` | Session 1 work: architecture docs + terminology cleanup | Ready to merge or extend |

*New branches will be created per feature and listed here.*

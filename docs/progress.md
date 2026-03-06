# Skill Flow Pro — Progress Tracker
*Updated at the end of every session. Read this at the start of every new session.*

---

## How This Works

**Claude Code writes all code and SQL directly.** You never run SQL or edit files manually.

**Your only job is validation:** Switch to the working branch in Lovable, click around in the app, and tell me in plain English what you see. I'll tell you exactly what to look for after each change.

**Branch → Lovable preview → merge to main** is the deploy cycle.

---

## Current Branch Status

| Branch | What's on it | What to do |
|---|---|---|
| `main` | Your live Alcan app. Untouched. | Leave alone until we're ready to merge |
| `claude/codebase-assessment-hq6Pn` | Session 1 work: architecture docs, terminology cleanup, Alcan org migration | Review in Lovable, merge to main when ready |
| `claude/ecstatic-ptolemy` | Current working branch (this session) | This is where new work goes |

---

## Database State (live, as of 2026-03-06)

| Table / Feature | Status | Notes |
|---|---|---|
| `organizations` table | ✅ Applied | Alcan: `a1ca0000-...`, slug: `alcan`, type: `pediatric` |
| `practice_groups.organization_id` | ✅ Applied | All 6 groups linked to Alcan |
| `user_capabilities` table | ❌ Not built | Next major milestone |
| `organization_pro_move_overrides` table | ❌ Not built | After user_capabilities |
| Role name overrides table | ❌ Not built | Allows org-specific role labels (e.g. "Dental Nurse" vs "RDA") |

---

## Work Queue (Ordered by Priority)

### 🔴 TIER 1 — Enterprise Foundation
*Build these first. Everything else depends on them.*

#### [DONE] 3a. Architecture Design
- `docs/enterprise-architecture.md` ✅
- `docs/roadmap.md` ✅
- Terminology locked: Organization = tenant, Group = sub-grouping, Location = practice

#### [PARTIAL] 3b. Tenant Schema
- `organizations` table ✅ (applied)
- `practice_groups.organization_id` ✅ (applied)
- Alcan backfilled ✅ (applied)
- `user_capabilities` table ❌
- App reads org context from auth ❌ (code written on branch, not yet in main)
- Organization onboarding flow ❌
- Super-admin view + org masquerade ❌ ← *last open question from Session 1*

#### [NOT STARTED] 3c. Pro Move Library (Two-Layer System)
- Add `practice_type` to `pro_moves` ❌
- `organization_pro_move_overrides` table ❌
- Org admin UI: show/hide pro moves ❌
- Starter pack seeding when org created ❌

#### [NOT STARTED] 3d. Granular Permissions Refactor
- `user_capabilities` table ❌
- Backfill from existing boolean flags ❌
- New user creation flow (participant vs. non-participant → capability toggles) ❌
- `useUserRole` hook updated ❌

#### [NOT STARTED] 3e. Timezone Fix (BLOCKER for UK launch)
- Audit `lib/centralTime.ts` usages ❌
- Replace hardcode with location-level timezone ❌
- Fix week boundary / Monday rollover logic ❌

---

### 🟡 TIER 2 — Doctor & Clinical Features
*Build after enterprise foundation is stable.*

#### [NOT STARTED] 2a. Doctor Feature Design (planning session)
- Define loose cadence vs. weekly staff cadence
- Clinical director's role in managing multiple doctors
- Data model for doctor tracking

#### [NOT STARTED] 2b. Doctor Feature Build
- Doctor dashboard (currently incomplete)
- Clinical director tools
- Doctor-specific evaluation flow

---

### 🟢 TIER 3 — Polish & Security
*Safe to do anytime. Independent of enterprise schema.*

#### [NOT STARTED] 1a. Quick Wins
- Delete backup files (`*.backup.tsx`)
- Error states on loading components
- TypeScript strictness improvements

#### [NOT STARTED] 1b. Security & RLS Audit
- After tenant schema is in — RLS will be rewritten with org isolation

---

### ⚪ TIER 4 — SaaS Features (earmarked, not yet sequenced)

| Feature | Priority | Blocker |
|---|---|---|
| GDPR compliance (erasure, export, DPA) | P0 for UK | — |
| Timezone handling | P0 for UK | In Tier 1 above |
| Org admin dashboard | P1 | Needs org layer |
| Email notifications | P1 | — |
| In-app notification center | P1 | — |
| Terms of service acceptance on login | P1 | — |
| Data export (CSV) | P1 | — |
| Bulk user import (CSV) | P2 | — |
| Pro move language customization (LLM) | Future | — |

---

## Super-Admin Design (Open Question)

You asked: *"What does my view look like as super-admin — tenant management, masquerading into orgs?"*

This is the next thing to design before building. Standard SaaS patterns:

**Option A — Separate super-admin dashboard**
A dedicated page (e.g., `/platform-admin`) only visible to `is_platform_admin` users. Shows all organizations, can click into any org and see it exactly as their admin would. No masquerade — just scoped read access across all orgs.

**Option B — Org switcher + masquerade**
A dropdown that lets you "switch" into any org's context, effectively seeing the app as that org's admin sees it. More powerful but more complex to build securely.

**Recommendation:** Option A first. Simpler, auditable, safe. Masquerade can be added later when you're onboarding multiple tenants and actually need to debug their experience.

→ **Decision needed:** Which option do you want?

---

## Key Decisions Made (Don't Re-Litigate)

| Decision | What was decided |
|---|---|
| Work sequencing | Enterprise → Doctor features → Polish |
| Terminology | Organization = tenant, Group = sub-grouping of locations |
| Practice type | Set at Organization level (not Group/Location) |
| Mixed practice types | Not supported Phase 1 |
| Group-level admin | Handled by scoped capability toggles — no separate role |
| Pro move customization Phase 1 | Visibility only (show/hide). No content editing yet |
| Bulk user import | P2 — email invite is primary onboarding for Phase 1 |
| UK timezone | Must fix before UK launch |
| Who writes SQL | Claude Code only. Never the user |

---

## Session Log

### Session 1 — 2026-03-06 (~2 hrs, planning)
- Full codebase assessment
- Designed multi-tenant architecture
- Locked terminology (Organization / Group / Location)
- Fixed Lovable's incomplete rename across 4 files + 1 migration
- Created `docs/enterprise-architecture.md` and `docs/roadmap.md`
- Applied 3 migrations: `organizations` table, `organization_id` FK, Alcan backfill
- Session ended before: `user_capabilities`, pro move library, super-admin design

### Session 2 — 2026-03-06 (current)
- Confirmed Supabase direct access (no user SQL needed)
- Verified database state post-Session 1
- Wrote this tracking document
- Next: design super-admin view, then build `user_capabilities`

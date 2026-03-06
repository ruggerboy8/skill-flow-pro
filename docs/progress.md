# Skill Flow Pro — Progress Tracker
*Updated at the end of every session. Read this at the start of every new session.*

---

## How We Collaborate

**The loop:**
1. Design in chat — agree before writing anything
2. Claude writes all code and SQL directly
3. Commit + push to branch
4. You switch to that branch in Lovable, click around
5. Tell me in plain English what you see / what's broken
6. Fix, push, repeat
7. When happy → merge to main in Lovable

**You never:** Write code, run SQL, edit files, touch the database.
**Lovable is:** A preview tool and deploy button. Its AI editor is retired from this project.

---

## Terminology (Locked — bugs come from drift)

| Term | Meaning | DB table |
|---|---|---|
| **Organization** | The tenant — top-level contracting entity (DSO, practice group, single practice) | `organizations` |
| **Group** | Sub-grouping of locations within an org | `practice_groups` |
| **Location** | Individual practice/office | `locations` |
| **Staff** | Any user of the platform | `staff` |

Hierarchy: Organization → Group → Location → Staff

> Many early tenants will be **single-location orgs** where all three levels collapse into one. The system must handle this gracefully (no forced group setup).

---

## App Identity

- The product is called **Pro Moves** (not "Skill Flow Pro" — that's just the repo name)
- White labeling is important: each org should show their own logo and name
- Currently shows Alcan logo at top — this needs to become per-org

---

## Branches

| Branch | Contents | Status |
|---|---|---|
| `main` | Live Alcan app | Protected — never touch directly |
| `claude/codebase-assessment-hq6Pn` | Session 1: architecture docs, terminology cleanup, Alcan org migration | Awaiting merge to main |
| `claude/ecstatic-ptolemy` | Current working branch | Active |

---

## Database State (live, as of 2026-03-06)

| Item | Status |
|---|---|
| `organizations` table | ✅ Applied — Alcan backfilled (id: `a1ca0000-...`, slug: `alcan`) |
| `practice_groups.organization_id` | ✅ Applied — all 6 groups linked to Alcan |
| `user_capabilities` table | ❌ Not built |
| `organization_pro_move_overrides` table | ❌ Not built |
| Role name overrides | ❌ Not built |
| White labeling / org branding | ❌ Not built |

---

## Key Product Decisions (Don't Re-Litigate)

| Decision | What was decided |
|---|---|
| Work sequencing | Enterprise foundation → UK launch readiness → Doctor features → SaaS polish |
| Terminology | Organization = tenant, Group = sub-grouping, Location = practice |
| Practice type | Set at Organization level |
| Mixed practice types | Not supported Phase 1 |
| Phase 1 pro move customization | Visibility only (show/hide) — no content editing |
| Org admin capabilities | Can create locations, invite users, change pro move visibility — no platform approval needed |
| Super-admin view | Separate `/platform-admin` page (Option A) — masquerade is future |
| Billing | Out of scope — handled externally |
| Audit log | Nice-to-have, not urgent |
| Support | Email only, no in-app support layer |
| White labeling | Yes — at minimum logo + org name per tenant |
| GDPR | Pushed back — UK partner is a known business partner, not a cold customer |
| Bulk user import | Phase 2 — UK prototype is single location, not needed yet |
| Doctor cadence | Instructional coaching model: observe → Calendly scheduling → review → feedback → next steps. No fixed cadence yet. |
| Doctor tracking | Currently: historical coaching conversation aggregator. First action: self-assessment baseline. KPIs eventually. |
| Clinical director | One per org. Typically the practice owner doctor. Coaches associate doctors. |
| Doctor pro moves | Separate library from staff pro moves |
| Permissions philosophy | Toggle-based, not archetype-based. Allow someone to be both a participant and a coach simultaneously. |
| UK roles | Receptionist (≈ DFI), Dental Nurse (≈ RDA), Office Manager, Doctor |
| UK pro move content | Exists in spreadsheet. Receptionist set is done; Dental Nurse/Office Manager/Doctor in progress. |
| Who writes code/SQL | Claude Code only. Never the user. |

---

## The UK Prototype — Context

- **Who:** One UK partner org, single general practice location. Business agreement in place.
- **Practice type:** General (vs. Alcan's pediatric)
- **Roles:** Receptionist, Dental Nurse, Office Manager, Doctor
- **Pro moves:** Being developed with a UK clinical partner. Receptionist: done. Others: in progress.
- **Scale:** Single location — no bulk import, no group admin needed
- **GDPR:** Can push back — this is a known partner, not a public launch
- **Goal:** Get them live in the system with their own org, their own role labels, their own pro moves visible

---

## ORDER OF WORK

---

### 🔴 PHASE 1 — Enterprise Foundation
*Required before any second tenant goes live.*

#### [PARTIAL] 1.1 Tenant Schema
- ✅ `organizations` table + Alcan backfill
- ✅ `practice_groups.organization_id`
- ❌ App reads org context in auth hook (code written on branch, not in main)
- ❌ Single-location org UX (handle collapsed org = group = location gracefully)

#### [NOT STARTED] 1.2 Granular Permissions (`user_capabilities`)
**What:** Replace boolean flags on `staff` with a toggle table. Allow someone to be both participant and coach. Redesign user creation flow.
**Estimated:** 2 sessions

#### [NOT STARTED] 1.3 Platform Admin View
**What:** `/platform-admin` page — only visible to `is_platform_admin` users. See all orgs, their status, click into any org's view.
**Estimated:** 1 session

#### [NOT STARTED] 1.4 Organization Onboarding Flow
**What:** You create a new org → system creates their first admin user → invite email sent → admin logs in, builds their environment.
**Estimated:** 2 sessions

#### [NOT STARTED] 1.5 Pro Move Library (Two-Layer)
**What:** Platform library (you control) + per-org visibility overrides (tenant shows/hides). Starter pack seeded on org creation by practice type.
**Estimated:** 1-2 sessions

#### [NOT STARTED] 1.6 Role Name Overrides
**What:** Small override table. Alcan sees DFI/RDA; UK org sees Receptionist/Dental Nurse. Display only.
**Estimated:** 0.5 sessions

#### [NOT STARTED] 1.7 White Labeling Basics
**What:** Per-org logo + org name displayed in the app header. Currently hardcoded to Alcan.
**Estimated:** 0.5-1 session

---

### 🟡 PHASE 2 — UK Launch Readiness
*Must complete before UK prototype goes live.*

#### [NOT STARTED] 2.1 Timezone Fix
**What:** Remove Central Time hardcode from `lib/centralTime.ts`. Use location-level timezone. Fix week boundary / Monday rollover logic.
**Why it's a blocker:** UK users will see wrong deadlines and wrong week calculations.
**Estimated:** 1-2 sessions

#### [NOT STARTED] 2.2 General Practice Pro Move Import
**What:** Load the UK pro moves from the spreadsheet into the platform library, tagged as `practice_type = 'general'`. Receptionist set first, then the others as they're finalized.
**Estimated:** 0.5 sessions per role set (mostly data work)

#### [NOT STARTED] 2.3 UK Org Setup
**What:** Create the UK org record, configure their role labels, seed their pro move library, invite their admin user. Partly a process (not just code), but needs the above phases complete first.
**Estimated:** 1 session

---

### 🟢 PHASE 3 — Doctor & Clinical Features
*Built after enterprise foundation is stable, and after the doctor workflow is better defined.*

#### [NOT STARTED] 3.1 Doctor Feature Design (planning session — no code)
**What to define:**
- Exact flow for a coaching session (Calendly → what happens in the app?)
- What the clinical director sees and does in the app per doctor
- Whether the clinical director/doctor self-assessment is a separate feature or reuses existing pro move submission
- Follow-up structure (what does "next steps" look like in data terms?)
- Whether a doctor can see their own history
**Estimated:** 1 session

#### [NOT STARTED] 3.2 Doctor Baseline Self-Assessment
**What:** First-login flow for doctors — they rate themselves on all their pro moves to establish a baseline. Already partially sketched in the clinical section.
**Estimated:** 1 session

#### [NOT STARTED] 3.3 Coaching Conversation Log
**What:** Clinical director logs a coaching session — date, doctor, notes, pro moves discussed, agreed next steps. This is the core historical record.
**Estimated:** 1-2 sessions

#### [NOT STARTED] 3.4 Clinical Director Dashboard
**What:** Multi-doctor view for the clinical director. See all doctors they're working with, last session date, upcoming sessions, progress over time.
**Estimated:** 1-2 sessions

#### [NOT STARTED] 3.5 Doctor Dashboard
**What:** Doctor's own view — their baseline, their coaching history, their agreed development areas.
**Estimated:** 1 session

---

### ⚪ PHASE 4 — SaaS Quality
*These make the product feel professional. Not blockers for UK launch.*

| Feature | Priority | Notes |
|---|---|---|
| Org admin dashboard (submission rates, login activity) | P1 | Useful once second tenant is live |
| Email notifications (submission reminders, eval assignments) | P1 | Currently no automated emails |
| In-app notification center | P2 | Bell icon + feed |
| Data export (CSV) | P2 | Org admins export their own data |
| GDPR (erasure, export, DPA) | P2 | Before any public/cold launch |
| Terms of service on first login | P2 | Before public launch |
| Bulk user import (CSV) | P3 | When a tenant has 20+ staff to onboard |

---

### ⬜ PHASE 5 — Polish & Security
*Can be done in parallel with anything above.*

| Item | Notes |
|---|---|
| RLS security audit | After tenant schema is complete — rewrite with org isolation |
| Backup files cleanup (`*.backup.tsx`) | Quick win |
| Error states on loading components | Replace generic spinners |
| TypeScript strictness | Surface real bugs to fix |
| Pagination on large lists | After multi-org data volume grows |

---

### 🔮 FUTURE (not sequenced)

- Pro move language customization with LLM review
- Doctor KPI integrations (from practice management systems)
- Formal doctor review/evaluation process (to be designed)
- Clinical director self-assessment / light participation in pro moves
- Masquerade / impersonate-org for platform admin
- SSO/SAML for enterprise login
- API access for practice management system integrations
- Mobile-optimized views
- AI-assisted pro move suggestions

---

## Session Log

### Session 1 — 2026-03-06 (~2 hrs, planning only)
- Full codebase assessment
- Multi-tenant architecture designed
- Terminology locked
- Fixed Lovable's incomplete rename (4 files + 1 migration)
- Created `docs/enterprise-architecture.md` and `docs/roadmap.md`
- Applied 3 migrations: `organizations` table, `organization_id` FK, Alcan backfill
- Ended before: `user_capabilities`, pro move library, super-admin design

### Session 2 — 2026-03-06 (current)
- Confirmed Supabase direct access (MCP tools working)
- Verified database state post-Session 1
- GitHub push credentials configured
- Gathered full context on UK prototype, doctor features, permissions, white labeling
- Revised and finalized order of work
- Next session: start Phase 1.2 (user_capabilities) or discuss Phase 1.7 (white labeling) — your call

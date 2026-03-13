# Enterprise Architecture: Multi-Tenant Design
*Status: Draft for review — not yet implemented*
*Last updated: 2026-03-06*

---

## Terminology Reference

These terms are used consistently throughout this document and across the entire
codebase. Any legacy usage of the old terms should be treated as a bug.

| Term | Meaning | Database table | Old term (deprecated) |
|---|---|---|---|
| **Organization** | The tenant — the top-level contracting entity (a DSO, a practice group, a single practice) | `organizations` (to be created) | "tenant" |
| **Group** | A sub-grouping of locations within an organization | `practice_groups` | "organization", "org" |
| **Location** | An individual practice/office | `locations` | — |
| **Staff** | Any user of the platform | `staff` | — |

The hierarchy is:
```
Organization (tenant, e.g., "Alcan DSO" or "Riverside Dental UK")
  └── Group (optional, e.g., "Alcan North")
       └── Location (e.g., "Alcan North - Downtown")
            └── Staff
```

For a single-practice organization, all three levels collapse: the organization,
the group, and the location are effectively one entity. The structure accommodates
both without forcing either into an awkward shape.

---

## Why This Document Exists

Skill Flow Pro was originally built as an internal tool for a single pediatric
dental organization (Alcan). We are now preparing to expand to additional
practice groups, including UK general practices. This requires two structural
changes:

1. **Multi-tenancy** — Multiple unrelated organizations can each use the platform
   with their own data, their own users, and their own version of the pro move
   library — completely isolated from one another.

2. **Granular permissions** — The current permission model uses boolean flags on
   each user record (`is_coach`, `is_super_admin`, etc.). This works for one
   organization but becomes rigid and hard to manage at scale. We are replacing
   it with a flexible, toggle-based system.

---

## Part 1: The Organization (Tenant) Model

### What Is an Organization?

An **organization** is the entity that controls which pro moves their staff sees.
It is the owner of a customized environment within the platform.

In most cases an organization maps to a single practice or location. For groups
like Alcan (a DSO — Dental Service Organization), the organization maps to the
management company, which has practice groups and locations underneath it.

**The organization boundary defines data isolation.** Users in one organization
can never see data belonging to another organization.

### Current State vs. Proposed

**Current (two levels):**
```
practice_groups (was "organizations" — a grouping of locations)
  └── locations
       └── staff
```

**Proposed (three levels):**
```
organizations (new — the tenant/top-level entity)
  └── practice_groups (existing — a grouping of locations)
       └── locations (existing)
            └── staff (existing)
```

### The `organizations` Table (New)

```sql
CREATE TABLE organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,         -- e.g., "Alcan DSO"
  slug           TEXT UNIQUE NOT NULL,  -- e.g., "alcan" (used in URLs)
  practice_type  TEXT NOT NULL,         -- "pediatric" | "general"
  created_at     TIMESTAMPTZ DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id)
);
```

`practice_type` is set at the organization level. Mixed practice types within a
single organization are not supported in Phase 1 — this can be revisited if a
real use case emerges.

The `practice_groups` table gains an `organization_id` foreign key. Everything
below groups (locations, staff, evaluations, submissions, etc.) inherits
organization membership through this chain.

### Organization Isolation (Row-Level Security)

Supabase Row-Level Security (RLS) policies will be updated so that every query
is filtered to the requesting user's organization. This is enforced at the
database level — not just in the application. Even if there were a bug in the
app, the database would refuse to return another organization's data.

### Organization Onboarding Flow

1. **Platform admin** (Skill Flow Pro staff) creates a new organization record
   and designates an `org_admin` user.
2. The `org_admin` receives an invitation email and sets up their account.
3. The `org_admin` can then:
   - Create groups and locations within their organization
   - Invite additional users with whatever capability toggles they choose
   - View and manage their pro move library visibility

---

## Part 2: The Pro Move Library

### The Two-Layer Model

**Layer 1 — Platform Library (centrally controlled by Skill Flow Pro)**
- Contains the canonical set of pro moves for each practice type
  (pediatric, general)
- Only platform admins can add, edit, or remove entries
- Never belongs to any organization

**Layer 2 — Organization Library (organization-controlled)**
- When an organization is created, the platform copies the matching starter pack
  (based on `practice_type`) into their organization library
- Each entry links to its source in the platform library
- Organizations can only control **visibility**: each pro move can be `visible`
  (default) or `hidden`
- Hidden pro moves are excluded from weekly assignments, evaluations, and domain
  detail views for that organization

### Phase 1 Scope: Visibility Only

For the initial launch, organizations cannot edit pro move content. The only
control they have is showing or hiding individual pro moves. This prevents
organizations from accidentally breaking the pedagogical structure of the program.

**Future Phase: Language Customization**
A planned future phase will allow organizations to override specific text within
a pro move (e.g., substituting their internal policy name). This will include a
lightweight LLM review step. Out of scope for Phase 1.

### Database Design

```sql
-- pro_moves: add practice_type to platform library
ALTER TABLE pro_moves ADD COLUMN practice_type TEXT DEFAULT 'pediatric';
-- values: "pediatric" | "general" | "all"

-- New table: per-organization visibility overrides
CREATE TABLE organization_pro_move_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pro_move_id  UUID NOT NULL REFERENCES pro_moves(action_id),
  is_hidden    BOOLEAN NOT NULL DEFAULT false,
  hidden_at    TIMESTAMPTZ,
  hidden_by    UUID REFERENCES staff(id),
  UNIQUE (org_id, pro_move_id)
);
```

When the app fetches pro moves for an organization, it joins these two tables
and filters out any row where `is_hidden = true`. A missing override row means
the pro move is visible.

---

## Part 3: Permissions Model

### Current State (Boolean Flags)

Every staff record has boolean columns defining what the user can do:

```
staff
  is_super_admin        BOOLEAN
  is_org_admin          BOOLEAN  ← currently means "group admin", will be repurposed
  is_coach              BOOLEAN
  is_participant        BOOLEAN
  is_lead               BOOLEAN
  is_office_manager     BOOLEAN
  is_doctor             BOOLEAN
  is_clinical_director  BOOLEAN
```

Problems at scale:
- Roles are blunt — no nuance about what "coach" means for this specific user
- Location scoping is in a separate `coach_scopes` table that is loosely
  connected to the flag system
- Adding a new capability requires a schema migration

### Proposed State: Capability Toggles

**1. User Type** (the primary bifurcation)

Every user is one of:
- `participant` — sees weekly pro moves, submits confidence/performance ratings
- `non-participant` — has administrative or coaching capabilities defined by
  their capability toggles

**2. Capability Toggles**

```sql
CREATE TABLE user_capabilities (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id              UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  can_view_submissions  BOOLEAN NOT NULL DEFAULT false,
  can_submit_evals      BOOLEAN NOT NULL DEFAULT false,
  can_review_evals      BOOLEAN NOT NULL DEFAULT false,
  can_invite_users      BOOLEAN NOT NULL DEFAULT false,
  can_manage_library    BOOLEAN NOT NULL DEFAULT false,  -- show/hide pro moves
  can_manage_locations  BOOLEAN NOT NULL DEFAULT false,
  can_manage_users      BOOLEAN NOT NULL DEFAULT false,
  is_org_admin          BOOLEAN NOT NULL DEFAULT false,  -- full org control
  is_platform_admin     BOOLEAN NOT NULL DEFAULT false,  -- cross-org (SFP staff only)
  UNIQUE (staff_id)
);
```

**3. Location/Group Scope**

The existing `coach_scopes` table handles which locations a user can see. This
stays as-is but becomes the canonical scoping mechanism for all non-participant
users, not just coaches.

### Creating a New User — The Decision Tree

```
Q1: Will this person see and submit weekly pro moves?
    YES → Participant. Select their staff role (DFI, RDA, Office Manager, etc.)
          Done.
    NO  → Continue.

Q2: What locations/groups should they be able to see?
    → Select specific locations, specific groups, or the whole organization.

Q3: What should they be able to do?
    → Toggle capabilities:
      [ ] View staff submissions
      [ ] Create evaluations for staff
      [ ] Review and approve evaluations
      [ ] Invite new users
      [ ] Show/hide pro moves in the library
      [ ] Manage locations
      [ ] Manage users and their permissions
```

### Group-Level Administration

A user with `can_manage_users` and `can_manage_locations` whose scope is limited
to a specific group effectively acts as a group admin — without needing a
separate role. Scope + capabilities together define what they can see and do.
This handles the DSO use case where a regional manager oversees one group of
practices within a larger organization.

### Backward Compatibility

Old boolean flags will not be deleted immediately:

1. Create `user_capabilities` and backfill from existing flags
2. Update app permission-checking logic to read from `user_capabilities`
3. Validate existing Alcan instance is unaffected
4. Deprecate (but don't drop) old flag columns
5. Drop old columns in a later cleanup migration

---

## Part 4: Standard SaaS Features Gap Analysis

These features are missing from the current platform and are earmarked for
implementation as the platform matures for enterprise deployment.

### Critical for UK/Enterprise (Legal or Functional Blockers)

| Feature | Why It Matters | Priority |
|---|---|---|
| **GDPR compliance** | Legally required for UK users. Right to erasure, data export on request, data retention policy, Data Processing Agreement flow | P0 before UK launch |
| **Proper timezone handling** | App currently hard-codes US Central Time. UK users will see wrong deadlines and week boundaries | P0 before UK launch |
| **Organization onboarding flow** | Currently manual. Need self-contained flow: org signs up → org admin account created → env built | P0 |
| **Audit log** | Who changed what, when. Required for enterprise accountability | P1 |

### Standard SaaS Quality-of-Life

| Feature | Why It Matters | Priority |
|---|---|---|
| **Email notifications** | Deadline reminders, evaluation assignments, coach feedback alerts | P1 |
| **In-app notification center** | Bell icon with feed: "pending evaluation," "coach left feedback," etc. | P1 |
| **Org admin dashboard** | See who has logged in, who hasn't onboarded, overall submission rates | P1 |
| **Data export (CSV)** | Org admins export staff data, submission history, eval results for their own reporting | P1 |
| **Bulk user import** | CSV upload for onboarding large practices (30+ staff) | P2 |
| **Terms of service acceptance** | Users accept ToS on first login. Required for UK | P1 |

### Technical Debt to Address Alongside Enterprise Build

| Issue | Impact | Priority |
|---|---|---|
| Timezone hardcoding in `lib/centralTime.ts` | Wrong deadlines for non-US locations | P0 |
| No pagination on large data tables | Performance degrades with data growth | P2 |
| No retry logic for failed API calls | Silent failures | P2 |
| Generic loading spinners with no error state | Users can't distinguish slow vs. broken | P2 |
| Backup files in source (`*.backup.tsx`) | Codebase clutter | P3 |

---

## Part 5: Migration Strategy

### Principles
- Must not disrupt the current Alcan deployment
- No big-bang cutover — each step is independently deployable
- Each step can be rolled back without affecting the next

### Step 1 — Schema Additions (Non-Breaking)
Add `organizations` table. Add `organization_id` to `practice_groups`. Create
`organization_pro_move_overrides`. Create `user_capabilities`. No existing data
is changed.

### Step 2 — Backfill Existing Data
Create an organization record for Alcan. Link existing `practice_groups` to it.
Populate `user_capabilities` for all existing staff by mapping current boolean
flags. Copy all existing pro moves into Alcan's organization library (all visible
by default).

### Step 3 — Update RLS Policies
Add organization-scoped RLS policies. Test in staging before applying to
production.

### Step 4 — Update Application Logic
- Permission checking reads from `user_capabilities`
- Pro move fetching filters by organization visibility
- User creation flow updated to capability-toggle model
- Timezone handling fixed (location-level timezone replaces Central Time hardcode)

### Step 5 — Validate with Alcan
Run the existing Alcan instance on the new code. Confirm everything works exactly
as before for all existing users.

### Step 6 — Onboard First New Organization
Use the new organization admin flow to onboard the first UK practice group.

---

## Open Questions Resolved

1. **Mixed practice types within one organization?** — Not supported in Phase 1.
   `practice_type` is set at the organization level. Revisit if a real use case
   emerges.

2. **Group-level admin?** — Handled by scoping capability toggles to a specific
   group. No separate role needed.

3. **Bulk user import?** — Earmarked as P2. Email invite remains the primary
   onboarding path for Phase 1.

4. **UK timezone?** — Confirmed blocker. Must be fixed before UK launch. Location-
   level timezone (already in schema) will replace the Central Time hardcode.

---

*This document should be agreed upon before any implementation begins.
Implementation will proceed in the sequence described in Part 5.*

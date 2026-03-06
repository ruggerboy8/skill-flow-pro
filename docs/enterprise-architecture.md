# Enterprise Architecture: Multi-Tenant Design
*Status: Draft for review — not yet implemented*
*Last updated: 2026-03-06*

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

## Part 1: The Tenant Model

### What Is a Tenant?

A **tenant** is the entity that controls which pro moves their staff sees. It is
the owner of a customized environment within the platform.

In most cases a tenant maps to a single practice or location. But for groups
like Alcan (a DSO — Dental Service Organization), the tenant maps to the
management company, which may have multiple practice groups and locations
underneath it.

**The tenant boundary defines data isolation.** Users in one tenant can never
see data belonging to another tenant.

### The Hierarchy (Current vs. Proposed)

**Current (two levels):**
```
Organization (e.g., "Main Organization")
  └── Location (e.g., "Main Location")
       └── Staff
```

**Proposed (three levels):**
```
Tenant (e.g., "Alcan DSO" or "Riverside Dental Group UK")
  └── Organization (e.g., "Alcan North" or "Riverside Birmingham")
       └── Location (e.g., "Alcan North - Downtown" or "Birmingham Central")
            └── Staff
```

For a single-practice tenant, all three levels may collapse to one entity — the
tenant, the organization, and the location are effectively the same thing. The
structure supports both simple and complex arrangements without forcing either
into an awkward shape.

### The `tenants` Table (New)

```
tenants
  id                UUID (primary key)
  name              TEXT  — e.g., "Alcan DSO"
  slug              TEXT  — e.g., "alcan" (used in URLs)
  practice_type     TEXT  — "pediatric" | "general" (determines starter pro move pack)
  created_at        TIMESTAMP
  created_by        UUID  — references the platform admin who onboarded this tenant
```

The `organizations` table gains a `tenant_id` foreign key. Everything below
organizations (locations, staff, evaluations, submissions, etc.) inherits tenant
membership through this chain — no other tables need to change structurally.

### Tenant Isolation (Row-Level Security)

Supabase uses Row-Level Security (RLS) policies to control who can see what.
Currently these policies are minimal. With tenants, every table query will be
filtered so that users can only ever retrieve rows belonging to their own tenant.

This is enforced at the database level — not just in the application. Even if
there were a bug in the app, the database would refuse to return another
tenant's data.

### Tenant Onboarding Flow

1. **Platform admin** (us) creates a new tenant record and assigns a
   `tenant_admin` user.
2. The `tenant_admin` receives an invitation email and sets up their account.
3. The `tenant_admin` can then:
   - Create organizations and locations within their tenant
   - Invite additional users (with whatever permissions they choose)
   - View and manage their pro move library visibility

---

## Part 2: The Pro Move Library

### The Two-Layer Model

There are two distinct layers:

**Layer 1 — Platform Library (centrally controlled by Skill Flow Pro)**
- Contains the canonical set of pro moves for each practice type
  (pediatric, general)
- Only platform admins can add, edit, or remove entries here
- This is the "source of truth" — it never belongs to any tenant

**Layer 2 — Tenant Library (tenant-controlled)**
- When a tenant is created, the platform copies the appropriate starter pack
  into their tenant library
- Each entry in the tenant library is linked to its source in the platform
  library (so updates can be tracked), but exists independently
- Tenants can only control **visibility**: each pro move can be marked
  `visible` (default) or `hidden`
- Hidden pro moves do not appear for staff at that tenant — they are excluded
  from weekly assignments, evaluations, and the domain detail views

### Phase 1 Scope: Visibility Only

For the initial launch, tenants cannot edit pro move content. The only control
they have is showing or hiding individual pro moves. This is intentional — it
keeps the system simple and prevents tenants from accidentally breaking the
pedagogical structure of the program.

**Future Phase: Language Customization**
A planned future phase will allow tenants to override specific text within a pro
move (e.g., substituting their internal policy name for a generic reference).
This will be supported by a lightweight LLM review step that checks whether the
proposed change maintains the intent of the original. This is out of scope for
the initial build.

### Database Design

```
pro_moves                        (platform library — existing table, extended)
  id                UUID
  practice_type     TEXT          "pediatric" | "general" | "all"
  ...existing columns...

tenant_pro_move_overrides        (new table)
  id                UUID
  tenant_id         UUID → tenants.id
  pro_move_id       UUID → pro_moves.id
  is_hidden         BOOLEAN       default false
  hidden_at         TIMESTAMP
  hidden_by         UUID → staff.id
  UNIQUE (tenant_id, pro_move_id)
```

When the app fetches pro moves for a tenant, it joins these two tables and
filters out any row where `is_hidden = true`. If no override row exists for a
given pro move, it is treated as visible.

---

## Part 3: Permissions Model

### Current State (Boolean Flags)

Right now, every staff record has a set of boolean columns that define what the
user can do:

```
staff
  is_super_admin        BOOLEAN
  is_org_admin          BOOLEAN
  is_coach              BOOLEAN
  is_participant        BOOLEAN
  is_lead               BOOLEAN
  is_office_manager     BOOLEAN
  is_doctor             BOOLEAN
  is_clinical_director  BOOLEAN
```

This works for one organization but has problems at scale:
- Roles are **additive but blunt** — you either are or aren't a coach, with no
  nuance about what "coach" means for this particular user
- Location scoping is handled by a separate `coach_scopes` table that is
  partially disconnected from the flag system
- Adding a new capability requires a database migration to add a new column

### Proposed State: Capability Toggles

We replace the flag system with two things:

**1. User Type** (the primary bifurcation — this stays simple)

Every user is one of:
- `participant` — sees weekly pro moves, submits confidence/performance ratings
- `staff` — does not see weekly pro moves; has administrative or coaching
  capabilities defined by their capability toggles

**2. Capability Toggles** (granular, per-user)

A new `user_capabilities` table holds the specific things a non-participant
user is allowed to do:

```
user_capabilities
  id                    UUID
  staff_id              UUID → staff.id
  can_view_submissions  BOOLEAN   — see what staff have submitted
  can_submit_evals      BOOLEAN   — create evaluations for staff
  can_review_evals      BOOLEAN   — review and sign off on evaluations
  can_invite_users      BOOLEAN   — send invitations to new users
  can_manage_library    BOOLEAN   — show/hide pro moves (tenant library)
  can_manage_locations  BOOLEAN   — create/edit locations
  can_manage_users      BOOLEAN   — edit user records and permissions
  is_tenant_admin       BOOLEAN   — full control within their tenant
  is_platform_admin     BOOLEAN   — cross-tenant (Skill Flow Pro staff only)
```

**3. Location Scope** (who can they see?)

The existing `coach_scopes` table already handles this — a user is scoped to
specific locations or the whole organization. This stays as-is but gets
documented as the canonical location scoping mechanism.

### Creating a New User — The Decision Tree

When a tenant admin creates a user, they answer three questions in sequence:

```
Q1: Will this person see and submit weekly pro moves?
    YES → They are a Participant. Choose their staff role (DFI, RDA, etc.).
          Done.
    NO  → Continue to Q2.

Q2: What locations should they be able to see?
    → Select one location, multiple locations, or the whole organization.

Q3: What should they be able to do?
    → Toggle capabilities individually:
      [ ] View what staff have submitted
      [ ] Create evaluations for staff
      [ ] Review and approve evaluations
      [ ] Invite new users
      [ ] Show/hide pro moves in the library
      [ ] Manage locations
      [ ] Manage users and their permissions
```

This replaces the current "select a role archetype" model with a compose-your-
own approach that can accommodate the variety of structures across different
tenant organizations.

### Backward Compatibility

The existing boolean flags on the `staff` table will not be deleted immediately.
During a transition period:

1. The new `user_capabilities` table is created and populated for all existing
   users by mapping their current flags to the new system
2. The app's permission-checking logic is updated to read from
   `user_capabilities` instead of the staff flags
3. After the app is confirmed working, the old flags are deprecated (but not yet
   dropped, in case a rollback is needed)
4. The old flag columns are dropped in a later cleanup migration

This approach means there is no big-bang cutover — the existing Alcan instance
continues to work throughout the migration.

---

## Part 4: What Is Not Changing

These aspects of the current system are **not** changing in this phase:

- The weekly cycle and submission flow (confidence/performance ratings)
- Evaluations and the evaluation wizard
- The coach dashboard and staff evaluation views
- The pro move content itself (pediatric pro moves stay as-is)
- The AI-powered sequencer ranking (edge function)
- The doctor and clinical director features (these are being built out
  separately, on top of this foundation)

---

## Part 5: Migration Strategy

The migration must not disrupt the current Alcan deployment. The approach:

**Step 1 — Schema additions (non-breaking)**
Add the `tenants` table. Add `tenant_id` to `organizations`. Create
`tenant_pro_move_overrides`. Create `user_capabilities`. No existing data is
changed.

**Step 2 — Backfill existing data**
Create a `tenant` record for Alcan. Link existing organizations to it. Populate
`user_capabilities` for all existing staff by mapping current boolean flags.
Copy all existing pro moves into Alcan's tenant library (all visible by default).

**Step 3 — Update RLS policies**
Add tenant-scoped RLS policies alongside existing ones. Test thoroughly in a
staging environment before applying to production.

**Step 4 — Update application logic**
Swap the permission-checking code to read from `user_capabilities`. Update the
pro move fetching logic to filter by tenant visibility. Update the user creation
flow to the new capability-toggle model.

**Step 5 — Validate with Alcan**
Run the existing Alcan instance on the new code. Confirm everything still works
exactly as before for existing users.

**Step 6 — Onboard first new tenant**
Use the new tenant admin flow to onboard the first UK practice group.

---

## Open Questions (For Discussion Before Implementation)

1. **Practice type at which level?** We've placed `practice_type` on the tenant.
   Should a single tenant ever have mixed practice types (some locations
   pediatric, some general)? If yes, `practice_type` moves down to the location
   level. If no, tenant-level is simpler and correct.

2. **Tenant admin vs. org admin.** In the current system `is_org_admin` means
   admin within the one organization. In the new model, the `tenant_admin`
   capability covers the whole tenant (which may have multiple organizations).
   Do we need a separate "org admin" layer within a tenant, or is tenant admin
   sufficient?

3. **Invitation flow.** Currently users are invited by super admins. In the new
   model, tenant admins can invite. Should invitations be email-only (current),
   or should we support bulk CSV import for large practice groups?

4. **UK timezone.** Locations already have a `timezone` column. This should
   cover UK practices out of the box, but needs verification — particularly the
   `lib/centralTime.ts` utility which currently hard-codes Central Time as the
   assumed timezone.

---

*This document should be agreed upon before any implementation begins.
Implementation will proceed in the sequence described in Part 5.*

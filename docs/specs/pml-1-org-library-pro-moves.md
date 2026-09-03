# PML-1: Wire up org library pro moves properly

**Status:** APPROVED (John, 2026-09-03)
**Lane:** medium
**Ticket:** PML-1 on the MyProMoves Dev Board (tk_ZsuxGx8LEiqaMnGrXKx4rZ)
**Branch (suggested):** `fix/pml-1-org-library-pro-moves`

## What and why

Org admins can add custom pro moves from the Pro-Move Library tab in `/builder`,
and the rows land correctly in `organization_pro_moves` with a valid
`competency_id`. But the surfaces that read those rows were built without the
competency-to-domain lookup and without org-aware role labels, and the edit
affordance was never built. Result (reported by Arianna, 2026-09-03, verified
against prod): org-added moves show no domain, cannot be picked into a weekly
curriculum, cannot be edited, and display generic role names ("Dental
Assistant") instead of the org's labels ("RDA"). This spec fixes all four as
frontend-only changes. No migration: RLS from migration `20260612143951`
already grants org admins full CRUD on their own org's rows.

## Scope decisions (John, 2026-09-03)

- Editable fields: **action statement and description only**. Role and
  competency are fixed after creation; recategorization waits for PML-2.
- Org admins **can deactivate** an org move they created. Deactivating hides it
  from the library's active list and all pickers; weeks that already used it
  are untouched.
- In pickers, org moves appear **mixed in by domain** next to platform moves,
  with a small "Custom" indicator, not in a separate section.

## The five fixes

1. **Domain display** (`src/components/admin/OrgProMoveLibraryTab.tsx`)
   - The org-moves query (~line 207) selects
     `competencies!organization_pro_moves_competency_id_fkey(name)` but not the
     nested domain. Add the `domains` nesting, mirroring the platform-move
     query in the same file (~line 153).
   - The Domain cell hardcodes an em dash at ~line 674. Render the resolved
     domain name with the standard domain color tokens
     (`getDomainColor()` from `src/lib/domainColors.ts`).

2. **Week-builder selectability**
   - `src/components/planner/SmartSlotPicker.tsx` queries only `pro_moves`
     (~lines 63 to 86) and its `onSelect` has no org-move channel. Also fetch
     active `organization_pro_moves` for the org and role, resolve domain via
     competency, merge into the domain-grouped list with a "Custom" badge, and
     extend `onSelect` so `WeekBuilderPanel` (~line 1041) passes `orgMoveId`
     through to `handleSelectProMove`. The persistence path already supports
     this: `planner-upsert` resolves `competency_id` from
     `organization_pro_moves` and writes `org_move_id`. Use
     `fetchOrgProMoveMetaByIds` in `src/lib/proMoves.ts` and the Browse tab of
     `src/components/planner/LibraryPanel.tsx` (~lines 224 to 243) as the
     working templates.
   - `src/components/planner/ProMovePickerDialog.tsx`: the org-move embed at
     ~line 134 selects `competencies(id, ...)`, a column that does not exist
     (the PK is `competency_id`), so the fetch 400s silently; and ~line 145
     hardcodes `domain_name: ''`. Fix the embed, fetch the real domain name,
     and destructure/log the error instead of swallowing it.

3. **Editing and deactivating** (`OrgProMoveLibraryTab.tsx`)
   - Org-custom rows currently render a static "Custom" label (~line 681)
     where platform rows get action buttons. Add an Edit button opening a
     dialog with action statement and description, saving via `update` on
     `organization_pro_moves`, and a Deactivate action (sets `active = false`
     with a confirm step). Show deactivated moves either not at all or under
     the existing inactive filtering, matching how the tab treats hidden
     platform moves.
   - Verify every picker and library query filters `active = true` for org
     moves so a deactivated move disappears from pickers everywhere.

4. **Org role labels** (`OrgProMoveLibraryTab.tsx`, plus the pickers if they
   print role names)
   - Replace raw `roles.role_name` display with the org-resolved label. The DB
     function `resolve_role_display_name(org_id, role_id)` returns the right
     values (verified: RDA, DFI, OM, Lead RDA for Alcan). Reuse whatever
     existing frontend helper other surfaces use for org role labels before
     inventing a new one.

5. **Check-in / check-out wizards resolve org moves** (`src/pages/ConfidenceWizard.tsx`,
   `src/pages/PerformanceWizard.tsx`)
   - Both wizards join `weekly_assignments` only to `pro_moves` and read
     `item.pro_moves?.action_statement || ''` (e.g. `PerformanceWizard.tsx:303,
     368, 442`). An assignment carrying `org_move_id` (null `action_id`)
     renders a BLANK statement to the participant. This has already happened
     once in prod (Avenue Dental, week of 2026-06-15). Without this fix, the
     picker changes above would ship blank check-ins to Alcan the first time
     Arianna places an org move.
   - Fix: resolve `org_move_id` to `organization_pro_moves.action_statement`
     (and competency/domain) wherever the wizards read assignment content. The
     DB-side pattern to mirror is the COALESCE sweep in migration
     `20260612170000_org_move_visibility.sql`; the client-side helper is
     `fetchOrgProMoveMetaByIds` in `src/lib/proMoves.ts`.

## Acceptance script (for John or Arianna, as an org admin on desktop)

1. Open `/builder`, go to the Pro-Move Library tab. Expect: every org-added
   move (Arianna's seven) shows a colored domain chip, not a dash, and role
   names read RDA / DFI / OM, not Dental Assistant / Front Desk / Office
   Manager.
2. Click Edit on an org-added move, change a word in the action statement,
   save. Expect: the change appears immediately in the list. Platform moves
   are unchanged (still edit-locked for org admins).
3. Go to a planner role tab, open a future week's empty slot. Expect: the
   picker lists the org-added moves under their domains with a Custom badge,
   selectable like any other move.
4. Pick one into a slot and save the week. Expect: it persists after reload,
   with domain coloring, same as a platform move.
5. Deactivate one org-added move from the library tab. Expect: it disappears
   from the picker, but the week from step 4 still shows the move you placed.
6. As a participant in that role (test fixture: any Alcan participant with a
   week containing the org move), open the weekly view. Expect: the org move
   renders with its domain color and is scoreable like any other move.
7. Still as that participant, walk the check-in (confidence) and check-out
   (performance) wizards for that week. Expect: the org move's full statement
   appears in both wizards, never a blank card. Rate it; expect the score to
   save and appear in the week summary.

## Personas to test as

- admin(desktop) - primary
- participant - steps 4 and 6 (org move renders and scores in the weekly loop)
- lead - sanity pass on the week view

## Out of scope

- Any change to `pro_moves`, its ownership columns, or `org_visible_pro_moves`
  (that is PML-2).
- Sequencer/recommender visibility for org moves (PML-2).
- Learning materials, intervention text, or priorities on org moves (PML-2).
- Editing role or competency after creation (PML-2).
- Org overrides of platform move wording (existing separate mechanism,
  untouched).

## DB impact

None. RLS already permits org-admin update and the `active` column exists.
No migration ships with this ticket.

## Docs the builder must read

- CLAUDE.md: "Data model & terminology", design system conventions (domain
  color tokens, icon sizes, no hardcoded Tailwind colors).
- `docs/enterprise-architecture.md` for tenant terminology.
- `docs/testing.md` for the Supabase test double; `docs/dev/lint-policy.md`.
- This spec.
- Working code templates: `src/lib/proMoves.ts` (fetchOrgProMoveMetaByIds),
  `src/components/planner/LibraryPanel.tsx` Browse tab.

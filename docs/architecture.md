# Skill Flow Pro — Architecture

> ⚠️ **STALE — pending refresh.** Written against the March-6 branch
> (`claude/codebase-assessment-hq6Pn`), which was ~1,529 commits behind `main`. Routes, file
> layout, and line references below may be out of date and are slated for regeneration against
> current `main`. (The live-DB-derived [data-model.md](data-model.md) is unaffected.)

*How the codebase is structured: the stack, the front-end layout, routing, auth, the role
system, the backend, and the cross-cutting libraries. Verified against the code on 2026-06-22.*
*For domain concepts see [glossary.md](glossary.md); for the database see
[data-model.md](data-model.md).*

---

## Stack & shape

A **client-only single-page app** plus a **Supabase** backend. There is **no custom
application server**: the React app talks to Supabase directly, and security lives in the
database (Row-Level Security). Anything that needs a server (AI calls, privileged operations,
scheduled jobs) runs as a **Supabase Edge Function**.

- **Frontend:** Vite + React 18 + TypeScript, Tailwind CSS + shadcn/ui (Radix primitives),
  React Router v6, TanStack Query (React Query) for server state.
- **Backend:** Supabase — Postgres, Auth, RLS, Edge Functions (Deno).
- **Build/deploy:** `npm run dev` (Vite on port 8080) locally; production is published via
  Lovable; database changes ship via `npx supabase db push`. See [`/CLAUDE.md`](../CLAUDE.md).

## Front-end directory layout (`src/`)

| Path | What lives here |
|---|---|
| `main.tsx` / `App.tsx` | Entry point and the **single routing table** (see below). |
| `pages/` | Route components, grouped by area: `coach/`, `clinical/`, `doctor/`, `admin/`, `dashboard/`, `my-role/`, `my-location/`, `planner/`, `stats/`, plus the participant wizards (`ConfidenceWizard`, `PerformanceWizard`, `Review`). |
| `components/` | Reusable UI. `components/ui/` is the shadcn/ui primitive layer; feature folders (e.g. `my-role/`) hold composed components. |
| `hooks/` | Data + behavior hooks. Most server reads are a `useX` hook wrapping a React Query call (e.g. `useWeeklyAssignments`, `useStaffProfile`, `useUserRole`). |
| `lib/` | Framework-free business logic (see "Key libraries" below). |
| `integrations/` | `supabase/client.ts` (the configured Supabase client) and generated `types.ts`. |
| `contexts/` | React context providers (`BatchProcessorContext`, `NowProvider`). |
| `devtools/` | The **Sim/masquerade** tooling for viewing the app as another user. |
| `v2/` | Newer-generation components/screens (the app is mid-refresh; "V2" suffixes are common). |
| `types/` | Shared TypeScript types. |

## Routing

All routes are declared in one place: [`src/App.tsx`](../src/App.tsx). Structure:

- **Public, pre-auth routes** are handled *before* auth gating: `/auth/callback`,
  `/reset-password`, `/forgot-password`.
- Then auth gating: if no user → `Login`; if the user hasn't set a password →
  `SetupPassword`; otherwise the authenticated `<Routes>` tree renders inside `<Layout>`.
- **Authenticated areas** map to the personas: `/` (Index/home), `/my-role/*`,
  `/confidence/:week/step/:n` + `/performance/:week/step/:n` (the weekly wizards),
  `/review/:cycle/:week`, `/coach/*`, `/dashboard` + `/dashboard/location/:id`, `/my-location`,
  `/clinical/*` (clinical director), `/doctor/*`, `/admin` + `/admin/evaluations`,
  `/builder` and `/planner/{dfi,rda,om}` (sequencer/planning), and evaluation viewers.
- Many **legacy redirects** exist (old builder/eval-results/organization paths → current ones).
  Preserve these when refactoring routes.

## Auth & profile loading

Two layers, both keyed off the Supabase Auth user:

1. **`hooks/useAuth.tsx`** — the `AuthProvider`. Subscribes to Supabase `onAuthStateChange`,
   tracks `user`/`session`/`loading`, detects whether the user still `needsPasswordSetup`
   (via `user_metadata.password_set`), and does a lightweight `staff` role read for a few
   coarse flags. Exposes sign-in/up, password reset, sign-out, `refreshRoles`.
2. **`hooks/useStaffProfile.tsx`** — the authoritative profile read. Fetches the full `staff`
   row (role flags, location with calendar/timezone/deadlines, `coach_scopes`) via React Query.
   Supports **masquerade**: when the Sim devtool sets a `masqueradeStaffId`, it queries by
   `staff.id` instead of `user_id` so admins/QA can view the app as another user.

## Roles & permissions

Persona is **derived**, not stored as a single field. [`hooks/useUserRole.tsx`](../src/hooks/useUserRole.tsx)
takes the staff profile and computes the booleans the UI branches on:

- Reads legacy flags: `is_super_admin`, `is_org_admin`, `is_coach`, `is_participant`,
  `is_lead`, `is_office_manager`, `is_doctor`, `is_clinical_director`.
- Derives composite personas from those flags **plus** `coach_scopes`:
  - `isRegional` = org admin **or** has an org-level scope **or** manages 2+ locations.
  - `isCoach` = has any scope **or** the `is_coach` flag.
  - `showRegionalDashboard` / `showLocationDashboard` / `canAccessAdmin` / `canAccessClinical`
    are computed from the above.
  - `homeRoute` is chosen per persona (doctors → `/doctor`, non-participants → `/dashboard`,
    else `/`).

> Two important notes for anyone changing this:
> 1. `organizationId` is currently hard-coded to `undefined` in `useUserRole` with a comment
>    that it will be populated "after migrations + join re-enabled" — tenancy plumbing is
>    partway through. Don't assume it's live.
> 2. The newer `user_capabilities` table (see [data-model.md](data-model.md)) is **not** what
>    `useUserRole` reads yet. The flag-based logic here is still the source of truth in the UI.

## Backend: Supabase Edge Functions

Located in `supabase/functions/` (Deno). JWT verification is configured per-function in
`supabase/config.toml` (`verify_jwt = false` ⇒ public). Grouped by purpose:

- **Sequencing (recommendation only):** `sequencer-rank` ranks/**recommends** Pro Moves from
  historical data; a human (Regional Manager) makes the final assignment decision. `sequencer-rollover`
  is part of the **legacy** cycles-1–3 rollover→backlog path (dormant for current cycle-4+ usage).
- **Coaching/reminders:** `coach-remind`, `notify-eval-release`.
- **AI content pipeline:** `transcribe-audio`, `generate-audio`, `save-audio`,
  `format-transcript`, `format-reflection`, `format-agenda`, `format-pro-move-content`,
  `polish-note`, `extract-insights`, `categorize-doctor-content`, `map-observation-notes`.
- **Planning/admin:** `planner-upsert`, `admin-users` (JWT-protected user management).

Heavy or sensitive logic lives in **Postgres RPCs** (e.g. `get_staff_week_assignments`,
`get_staff_statuses`, `current_user_org_id()`, `resolve_role_display_name()`) so the weekly-loop
calculations stay in one authoritative place.

## Key libraries (`src/lib/`)

Business logic kept out of components and framework-free, so it's testable and reusable:

- **Time & cadence:** `centralTime.ts` (week anchors / deadlines — note: still defaults to
  `America/Chicago`, the timezone work is pending), `submissionPolicy.ts`, `evalPeriods.ts`,
  `weekAssembly.ts`.
- **Assignments & sequencing:** `sequencer/`, `sequencerAdapter.ts`, `plannerUtils.ts`,
  `backlog.ts`, `recommenderUtils.ts`, `participation.ts`. (See the deep-dive in
  [`src/lib/unifiedAssignments.md`](../src/lib/unifiedAssignments.md).)
- **Submissions & status:** `submissionStatus.ts`, `submissionPolicy.ts`,
  `submissionRateCalc.ts`, `coachStatus.ts`, `doctorStatus.ts`, `progressTracking.ts`.
- **Content & domains:** `proMoves.ts`, `domainUtils.ts`, `domainColors.ts`, `content/`,
  `highlights.ts`, `youtubeHelpers.ts`.
- **Evaluations:** `evaluations.ts`, `evaluationEligibility.ts`, `reviewPayload.ts`.
- **Misc:** `csvExport.ts`, `featureFlags.ts`, `linkValidation.ts`, `utils.ts`.

## Cross-cutting conventions

- **Server state via React Query.** Almost every read is a `useX` hook returning a query; global
  default is 5-min `staleTime`, `retry: 1` (see `App.tsx`). Prefer adding a hook over calling
  Supabase inline.
- **"V2" / wizard suffixes.** The app is mid-redesign; newer screens carry `V2` or live under
  `v2/`. When two versions exist, the V2/wizard one is usually the live path — confirm via the
  route table in `App.tsx`.
- **Feature flags & env.** Behavior toggles come from `.env` (`VITE_*`) and `lib/featureFlags.ts`
  (e.g. `VITE_USE_WEEKLY_ASSIGNMENTS`, sim tools).
- **The week formula is currently fragile, not sacred.** Cycle/week-in-cycle math must match
  across every surface and RPC (regression tests guard it), so changing it carelessly breaks
  things — but the cycle/week concept itself is **legacy** and slated for eventual retirement
  (see [glossary.md](glossary.md) and [improvement-backlog.md](improvement-backlog.md)). See
  `src/lib/unifiedAssignments.md`.

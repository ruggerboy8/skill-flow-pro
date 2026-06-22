# Security & RLS Audit — Skill Flow Pro

> ## ✅ Fixes applied (2026-06-22)
> The three confirmed holes — **Fix 2 (staff cross-org / super-admin escalation)**, **Fix 1
> (weekly_scores public backfill UPDATE/DELETE)**, and the **evaluation pre-release read** — were
> applied to the live database and verified against `pg_policies`. SQL recorded in
> [applied-rls-fixes-2026-06-22.sql](applied-rls-fixes-2026-06-22.sql) (migration
> `security_rls_hardening_2026_06_22`). Still open: the hardening backlog (Postgres upgrade,
> `function_search_path_mutable`, security-definer views, public storage buckets, auth settings)
> and the latent `user_capabilities` admin-write org scoping.
>
> ## ⚠️ Live-verification addendum (2026-06-22, added by main session)
> The original report below was reconstructed from migrations only (the subagent's live-DB tools
> were blocked). The main session subsequently queried **live `pg_policies` and Supabase security
> advisors**, which **corrects several findings**:
>
> - **OVERSTATED:** "Tenant isolation effectively not enforced on `staff`, `evaluations`,
>   `evaluation_items`." In the **live** DB these are **org-scoped**: `evaluations` and
>   `evaluation_items` gate writes via `is_same_org_eval(...)`, and the `staff` SELECT policy adds
>   `org_id_of_staff(id) = current_user_org_id()`. Cross-tenant *read* of these is **not** open.
>   Later migrations hardened these after the versions the subagent reconstructed.
> - **CONFIRMED (Critical):** `staff` UPDATE policy **"Coaches can manage staff privileges"** has
>   `USING/WITH CHECK = is_coach_or_admin(auth.uid())` with **no org predicate and no privilege
>   ceiling** → any coach/admin can modify staff rows in **other orgs**, and a coach can **self-
>   escalate to `is_super_admin`** (the WITH CHECK doesn't constrain new flag values).
> - **CONFIRMED (High):** `weekly_scores` policies **"Service role can update/delete backfill
>   scores"** are granted to **`{public}`**, not `service_role` — any authenticated user can
>   UPDATE/DELETE any row where `confidence_source='backfill_historical'`. (Supabase advisor also
>   flags this as **"RLS Policy Always True"**.)
> - **CONFIRMED (Medium):** `user_capabilities` **does** have RLS policies (so "wired to nothing"
>   is wrong), but `uc_admin_write` checks the *caller* is org/super admin **without scoping the
>   target row to the caller's org** → latent cross-org write (low impact today since the app
>   doesn't read this table yet).
> - **CONFIRMED (Medium, needs domain check):** Staff can read evaluations where
>   `status='submitted'`; if "released/visible to staff" is a *separate* state, this exposes
>   not-yet-released evaluations directly via the API.
> - **Supabase advisors (live):** 3 ERROR-level (incl. `vulnerable_postgres_version`,
>   `rls_policy_always_true`, `security_definer_view`) + 202 WARN — mostly
>   SECURITY DEFINER-function-executable notices (largely expected), plus 4
>   `function_search_path_mutable`, 2 public storage buckets allow listing, and auth hardening
>   (OTP expiry, leaked-password protection disabled). Hardening backlog, not emergencies.
> - **Independent of RLS — URGENT:** the committed Supabase **PAT in `CLAUDE.md`** and the
>   **git-tracked `.env`** stand as reported. **Rotate the PAT now.**

- **Date:** 2026-06-22
- **Auditor role:** Application Security Engineer (appsec / secure-SDLC review)
- **Scope:** Multi-tenant data isolation (RLS on tenant-scoped tables), the dual permission
  system (legacy `staff.is_*` flags vs `user_capabilities`), Supabase Edge Functions
  (`supabase/functions/` + `supabase/config.toml`), input validation / XSS, and secrets handling.
- **Method:** Static review of `supabase/migrations/` (462 migrations, read in dependency order to
  reconstruct the *final* policy per table), edge-function source, the React client
  (`src/`), and project docs. **The Supabase MCP tools (`get_advisors`, `execute_sql`) were
  blocked in this environment**, so live `pg_policies` / Supabase security-lint output could not be
  pulled — findings are reconstructed from migrations and code. Two live-DB items below
  (user_capabilities RLS, confirmation that no later out-of-band policy overrides these) are
  flagged as **needs live verification**. No source files were modified; no SQL was executed.

---

## Executive summary

- **Tenant isolation is effectively not enforced for the core tenant tables.** The strongest
  RLS policies on `staff`, `evaluations`, and `evaluation_items` gate on a *global*
  `is_coach / is_super_admin / is_org_admin` flag check with **no organization or location
  predicate**. Once a second real tenant is live, any coach/admin in org A can read (and for
  evaluations, write) org B's data. The org-isolation plumbing that was supposed to fix this
  (`current_user_org_id()`) exists but is **referenced by zero RLS policies**.
- **The `admin-users` Edge Function is a cross-tenant admin hole.** It authenticates the caller
  and checks `is_super_admin || is_org_admin`, but never checks that the *target* user is in the
  caller's org/scope. An org-admin of any org can `update_user` / `role_preset` / `pause_user` /
  `delete_user` / `reset_link` / `invite_user` against any user in any other org.
- **`weekly_scores` has a misnamed "Service role" policy that grants every authenticated user
  UPDATE/DELETE** on any row where `confidence_source = 'backfill_historical'` — cross-tenant
  tampering/deletion of historical scores. There is no `TO service_role` restriction.
- **The evaluation "release" gate is bypassable.** `is_visible_to_staff` is enforced only inside
  RPCs, never in an RLS policy; the base `evaluations` SELECT policy returns any `status='submitted'`
  evaluation to its owner, so a participant can read an unreleased evaluation via direct PostgREST.
- **A privileged Supabase Personal Access Token (`sbp_...`) is committed to the repo** in
  `CLAUDE.md`. `.env` is also git-tracked and not in `.gitignore`. Rotate the PAT now.
- **Two Edge Functions are genuinely unauthenticated** (`polish-note`, `format-reflection`:
  `verify_jwt=false` *and* no in-code auth) and proxy to a billed AI gateway — open cost/abuse vector.
- **Good news:** all `dangerouslySetInnerHTML` sinks are wrapped in `DOMPurify.sanitize()`, so the
  LLM-generated `summary_html` / note-rendering paths are not XSS-exploitable as written.
- **Root cause / theme:** the codebase predates multi-tenancy. RLS was written for a single org
  ("any coach sees everyone" was correct then). The tenancy migration added the `organizations`
  table and a helper function but never rewrote the existing policies to use it. Privilege checks
  also rely on the legacy `is_*` flags, which `useUserRole`, the RPCs, and the policies all read —
  while `user_capabilities` (the migration target) is read by nothing yet.

**Findings by severity:** Critical: 3 · High: 4 · Medium: 4 · Low: 3

---

## Findings (ranked by severity)

### CRITICAL

#### C1. Tenant tables enforce global role checks, not org isolation
- **Where:**
  - `staff`: policy `"Coaches can read all staff"` — final form in
    `supabase/migrations/20250730202819_c2e9b554-cc7b-431c-bb10-99c7e9870ebd.sql:21`
    → `USING (user_id = auth.uid() OR public.is_coach_or_admin(auth.uid()))`.
  - `evaluations`: `"Coaches can manage evaluations"` —
    `supabase/migrations/20250820222745_f6e232c1-...:35` → `FOR ALL USING (is_coach_or_admin(auth.uid()))`.
  - `evaluation_items`: `"Coaches can manage evaluation items"` (same file, line 42), same pattern.
  - `is_coach_or_admin()` definition:
    `supabase/migrations/20250730202819_...:5` — only checks `is_coach OR is_super_admin`, no scope.
- **Why it matters:** These are the broadest surviving policies on the three most sensitive
  tenant tables. They contain **no `organization_id` / `group_id` / `location` predicate**. With
  4 organizations already in the live DB (`data-model.md`), any user with `is_coach=true` can
  `SELECT *` from `staff` across all orgs, and any coach/admin can read **and write/delete** every
  evaluation and evaluation item in every org (`FOR ALL`). This is the primary breach of the
  stated isolation guarantee ("users in one organization can never see another's data").
- **Concrete fix:** Add an org predicate to each. Because `staff → locations → practice_groups →
  organizations`, gate with a scoped helper, e.g.
  `is_coach_or_admin(auth.uid()) AND public.staff_in_my_scope(staff.id)` where the helper checks
  the caller's `coach_scopes` / `current_user_org_id()`. For super/platform admins keep the broad
  path. **Must run after `20260306190002`** (the `organization_id` FK) per the project's own RLS
  dependency rule. Add regression tests: a coach in org A gets 0 rows for org B's staff/evals.
- **Bucket:** Needs design discussion (changes who-sees-what; coordinate with the
  permissions-refactor and the `coach_scopes` scoping model). **Needs live verification** that no
  later out-of-band migration narrowed these.

#### C2. `admin-users` Edge Function performs privileged actions with no org/scope check on the target
- **Where:** `supabase/functions/admin-users/index.ts` — auth gate at lines 48–70
  (`is_super_admin || is_org_admin`), then `update_user` (282), `role_preset` (366),
  `reset_link` (663), `pause_user` (712), `delete_user` (814), `invite_user` (211).
  All mutate via the **service-role** client (`admin`, line 33) which bypasses RLS.
- **Why it matters:** The function checks *that the caller is some kind of admin*, never *that the
  target `user_id` belongs to the caller's org*. An `is_org_admin` from org A can reset passwords,
  pause, delete, relocate, or re-role any user in org B; `invite_user` accepts any `location_id`.
  Only two narrow extra checks exist (super-admin required to mint super_admins, line 374;
  clinical-director/super-admin for `invite_doctor`, line 882). `list_users` scopes results only
  for the Lead-RDA case (102–118) — org-admins get the full unscoped roster.
- **Concrete fix:** After resolving the target's `staff`/location, verify it resolves to the same
  org as the caller (reuse the org chain) unless the caller is `is_super_admin`. Reject otherwise
  with 403. Apply uniformly across every `case`, and scope `list_users` for org-admins too.
- **Bucket:** Needs design discussion (defines the org-admin boundary), but high urgency.

#### C3. Committed Supabase Personal Access Token (privileged management credential)
- **Where:** `CLAUDE.md` (tracked in git) contains
  `SUPABASE_ACCESS_TOKEN="sbp_ba76378959b1c92466fb8d0d27af9bfc2c983829"`. Confirmed tracked via
  `git grep`. The same token was also embedded in the audit prompt.
- **Why it matters:** A `sbp_` PAT is a **management-API** credential — it can link the project,
  run migrations, read/modify the entire database, deploy/replace Edge Functions, and read secrets.
  Anyone with repo access (or anyone the file leaks to) gets full project control. This is a far
  more serious credential than the anon key.
- **Concrete fix:** **Rotate the token immediately** in the Supabase dashboard (Account → Access
  Tokens → revoke). Remove it from `CLAUDE.md`; document the linking step as "use your own PAT from
  an env var," never a literal. Scrub it from git history (`git filter-repo` / BFG) since rotation
  alone leaves the old value in history. Treat as exposed.
- **Bucket:** SAFE to fix immediately (doc + rotation; history scrub is a separate housekeeping task).

---

### HIGH

#### H1. `weekly_scores` "Service role" policy grants UPDATE/DELETE to all authenticated users
- **Where:** `supabase/migrations/20251203200454_c110a98a-...:1-10` — policies
  `"Service role can update backfill scores"` and `"Service role can delete backfill scores"`,
  `USING (confidence_source = 'backfill_historical')`, **no `TO service_role`, no
  `staff_id`/owner/org predicate.** Confirmed never dropped.
- **Why it matters:** The names are misleading — the service role bypasses RLS and never needs a
  policy. As written these grant the `public` (authenticated) role the ability to UPDATE or DELETE
  **any** weekly score row whose `confidence_source='backfill_historical'`, for any staff member in
  any org. That is cross-tenant data tampering/destruction of historical performance data.
- **Concrete fix:** Drop both policies (the backfill job uses the service-role key and doesn't need
  them). If a non-service path genuinely needs them, scope with `TO service_role` or an
  owner/super-admin predicate. Verify the backfill Edge Function/script actually relies on the
  service-role key (it does elsewhere) before removing.
- **Bucket:** SAFE to fix (removing them restores intended behavior; verify the backfill path first).

#### H2. Evaluation release gate (`is_visible_to_staff`) is not enforced in RLS
- **Where:** `is_visible_to_staff` column added in
  `supabase/migrations/20260128144756_...`; the SELECT policy `"Staff can read submitted
  evaluations"` (`20250826185135_a6c63677-...:2`) gates only on
  `staff_id == me AND status='submitted'` — **no `is_visible_to_staff` check**. The release flag
  is checked only inside RPCs (`mark_eval_viewed`, `compute_and_store_review_payload`,
  `save_eval_acknowledgement_and_focus`). `is_visible_to_staff` appears in **no** RLS policy.
- **Why it matters:** A participant can bypass the UI/RPC and read their own not-yet-released
  evaluation (and its `evaluation_items`, scores, observer notes) directly via PostgREST
  (`/rest/v1/evaluations?staff_id=eq.<me>&status=eq.submitted`). The "coach hasn't released this
  yet" guarantee is only skin-deep. Given evaluations contain sensitive observer notes, this is a
  confidentiality break of the intended workflow.
- **Concrete fix:** Add `AND is_visible_to_staff = true` to the staff SELECT policy on
  `evaluations`, and mirror on `evaluation_items` (join to parent and require visible). Keep the
  coach/admin policy for the authoring path. Confirm no participant screen needs pre-release read.
- **Bucket:** Mostly SAFE (additive predicate), but verify no participant flow legitimately reads a
  submitted-but-unreleased eval first.

#### H3. Privilege checks read legacy `is_*` flags everywhere; `user_capabilities` is authoritative-in-name-only
- **Where:** RLS helper `is_coach_or_admin` (migration above); RPCs
  `release_single_evaluation` / `bulk_release_evaluations`
  (`20260211170312_8ce6a055-...:369,411`) check `is_coach/is_super_admin/is_org_admin`;
  `admin-users` reads `is_*`; `useUserRole` reads `is_*` (per `architecture.md` — `organizationId`
  hard-coded `undefined`). `user_capabilities` (53 live rows) is referenced by **no migration and
  no policy** (it was created out-of-band via Lovable).
- **Why it matters:** Two permission models coexist and **disagree**. The DB enforces the *old*
  flags; the *new* `user_capabilities` table is the documented target but is wired to nothing.
  Any admin UI that toggles capabilities will produce a user who *looks* permissioned in the new
  model but is actually governed by stale `is_*` flags (or vice-versa) — a classic
  inconsistent-authorization bug where a revoked capability still grants access because the flag
  wasn't also cleared. It also means there is no single source of truth to reason about during the
  isolation fixes (C1/C2).
- **Concrete fix:** Pick one source of truth before shipping more tenancy work. If `is_*` stays
  authoritative for now, make `user_capabilities` strictly derived (and stop presenting it as
  live). When migrating to `user_capabilities`, change the helpers/RPCs/`useUserRole` together and
  backfill, then deprecate the flags (the doc's own plan). Add a consistency test.
- **Bucket:** Needs design discussion (this is the permissions-refactor; high-value, touches auth
  everywhere). **Needs live verification** of `user_capabilities` RLS.

#### H4. `release_single_evaluation` / `bulk_release_evaluations` — unscoped release + spoofable `released_by`
- **Where:** `supabase/migrations/20260211170312_8ce6a055-...:355` and `:393`.
  Both `SECURITY DEFINER`; authorize on a global `is_coach OR is_super_admin OR is_org_admin`
  with **no check that the evaluation/location belongs to the caller's org**.
  `release_single_evaluation` writes `released_by = COALESCE(released_by, p_released_by)` from a
  **client-supplied** parameter (line 382).
- **Why it matters:** Any coach in any org can release (publish to the staff member) or unrelease
  any evaluation in any org, including pushing an in-progress eval live. The client-supplied
  `p_released_by` lets the caller forge the audit attribution of who released it (repudiation).
- **Concrete fix:** Derive `released_by` from `auth.uid()`→staff inside the function; drop the
  parameter. Add an org/location-scope check (caller must have scope over the eval's
  `location_id`). Same scope check on the bulk variant.
- **Bucket:** SAFE for the `released_by` fix (derive server-side). Scope check is part of the C1/H3
  design work.

---

### MEDIUM

#### M1. Unauthenticated AI-proxy Edge Functions (cost/abuse / DoS)
- **Where:** `supabase/config.toml` — `polish-note` and `format-reflection` are `verify_jwt=false`;
  their source (`supabase/functions/polish-note/index.ts`,
  `supabase/functions/format-reflection/index.ts`) has **no in-code auth** and forwards arbitrary
  `text` to the Lovable AI gateway billed to `LOVABLE_API_KEY`.
- **Why it matters:** Anyone who learns the function URLs can call them unlimited times and burn
  the org's AI budget (and potentially exhaust rate limits for real users). No data leak (key stays
  server-side), but a real availability/cost vector. CORS is `*`.
- **Concrete fix:** Set `verify_jwt = true` for both (they don't need to be public), or add an
  in-code JWT check like `extract-insights` does (`supabase.auth.getClaims`). Add basic rate
  limiting. Tighten CORS to the app origin.
- **Bucket:** SAFE to fix (flip `verify_jwt`; confirm no anonymous caller depends on them).

#### M2. `config.toml` declares `verify_jwt=false` for functions that don't exist in the repo
- **Where:** `supabase/config.toml` lists `sequencer-health` and `sync-onboarding-assignments` as
  `verify_jwt=false`, but there are **no such directories** under `supabase/functions/`.
- **Why it matters:** Either dead config (confusing, invites a future public function to be created
  under a name already marked public) or functions deployed out-of-band whose source isn't in the
  repo and therefore wasn't reviewed. A public `sync-onboarding-assignments` that writes
  assignments would be high-impact if it exists.
- **Concrete fix:** If unused, delete the stanzas. If deployed, get the source into the repo and
  review it; default new functions to `verify_jwt=true`. **Needs live verification** (list deployed
  functions).
- **Bucket:** Needs verification, then SAFE cleanup.

#### M3. `current_user_org_id()` returns NULL for staff with no `primary_location_id`
- **Where:** `supabase/migrations/20260306190002_...:17` (and re-defined in
  `20260306195757_...`). Joins `staff → locations → practice_groups`; a staff row with NULL
  `primary_location_id` (e.g. roaming doctors — `admin-users` `invite_doctor` sets
  `primary_location_id: null`, line 918) yields **NULL**.
- **Why it matters:** When this function is finally used in `<col> IN (SELECT current_user_org_id())`
  or `<col> = current_user_org_id()` predicates, a NULL result makes the predicate NULL/false and
  the user sees nothing (fail-closed, acceptable) — *but* if any policy is written as
  `current_user_org_id() IS NULL OR <col> = current_user_org_id()` (a tempting "let unmapped users
  through" shortcut), it becomes fail-open and leaks all orgs. Flagged now because the isolation
  rewrite (C1) will lean on this function.
- **Concrete fix:** When adopting it in policies, always fail-closed; never add an `IS NULL` escape
  hatch. Consider resolving roaming users via an explicit org column on `staff` instead of the
  location chain. Add a test for the NULL-location user.
- **Bucket:** Needs design discussion (guidance for the upcoming RLS rewrite).

#### M4. Verbose logging of PII in `admin-users`
- **Where:** `supabase/functions/admin-users/index.ts` — `console.log("Final row data:", row)`
  (204), `console.log("Auth data for ${uid}:", authData)` (150), plus logging of emails/user ids
  throughout.
- **Why it matters:** Emails, names, sign-in timestamps and role flags are written to function logs
  on every `list_users` call. Log access is broader than DB access and is out of scope of RLS;
  for a UK/GDPR tenant this is an over-collection / data-minimization concern.
- **Concrete fix:** Drop or gate the row/auth-data logs behind a debug flag; never log full PII rows
  in production.
- **Bucket:** SAFE to fix.

---

### LOW

#### L1. `.env` is git-tracked and not in `.gitignore`
- **Where:** `.gitignore` ignores `*.local` but not `.env`; `git ls-files` confirms `.env` is
  tracked. It currently holds only public `VITE_*` values (anon key, URL, flags) — low risk *today*.
- **Why it matters:** Structural footgun: the first time anyone adds a real secret (service-role
  key, API key) to `.env`, it will be committed. `VITE_*` values are also bundled into the client
  regardless, so secrets must never live there.
- **Concrete fix:** Add `.env` to `.gitignore`, keep a committed `.env.example` with placeholders,
  and document that only public `VITE_*` config belongs in `.env`.
- **Bucket:** SAFE to fix.

#### L2. CORS `Access-Control-Allow-Origin: *` on all Edge Functions
- **Where:** every function in `supabase/functions/*` (e.g. `admin-users` line 22,
  `extract-insights` line 6).
- **Why it matters:** Combined with bearer-token auth this isn't directly exploitable (no cookies),
  but `*` on an admin endpoint is needlessly permissive and aids token-replay tooling from any
  origin.
- **Concrete fix:** Echo/allow only the app origin(s) (`SITE_URL`) for the privileged functions.
- **Bucket:** SAFE to fix.

#### L3. Sim/masquerade gated only by a client env flag + client `isAdmin`
- **Where:** `src/devtools/SimConsole.tsx:277` (`isAdmin && VITE_ENABLE_SIMTOOLS==='true'`);
  `src/hooks/useStaffProfile.tsx:109-110` switches the query to `eq('id', masqueradeStaffId)`.
  `VITE_ENABLE_SIMTOOLS="true"` is set in `.env`.
- **Why it matters:** The masquerade *view switch* is client-gated, but the underlying read still
  goes through RLS — so the real exposure is just C1 (a coach can read any staff). The env flag and
  `isAdmin` are not a server-side boundary; they only hide the UI. Listed Low because it amplifies
  C1 rather than adding new access, but worth noting that "only admins can masquerade" is not
  actually enforced server-side.
- **Concrete fix:** Treat masquerade strictly as a UI affordance; rely on the (fixed) RLS for actual
  protection. Don't ship `VITE_ENABLE_SIMTOOLS=true` to production builds.
- **Bucket:** SAFE (config), but the real protection depends on fixing C1.

---

## Positive findings (no action)

- **XSS sinks are sanitized.** Every `dangerouslySetInnerHTML` in feature code wraps content in
  `DOMPurify.sanitize()`: `src/components/coach/InsightsDisplay.tsx:36,129`,
  `src/pages/EvaluationViewer.tsx:81,492`, `src/components/clinical/CombinedPrepView.tsx:56`,
  `src/pages/doctor/DoctorReviewPrep.tsx:320`. This correctly neutralizes the LLM-generated
  `summary_html` and free-text coach notes. (`src/components/ui/chart.tsx` is shadcn's standard CSS
  injection, not user content.)
- **`extract-insights` is safe despite `verify_jwt=false`:** it performs its own JWT check via
  `supabase.auth.getClaims()` (`index.ts:32-39`) before doing any work. (Worth aligning config to
  `true` for clarity, but not a vuln.)
- **Evaluation review RPCs are well-built:** `SECURITY DEFINER` with explicit caller resolution,
  ownership checks (`v_eval.staff_id <> v_staff_id` ⇒ reject), `status`/visibility gates for
  non-admins, idempotency, and bounded inputs (`save_eval_acknowledgement_and_focus` caps focus at
  3 and validates action_ids belong to the eval). These are the pattern to copy elsewhere.
- **Parameterized access throughout:** the client uses the supabase-js query builder and RPCs; no
  string-concatenated SQL was found in app code. SQL-injection surface is minimal.

---

## Fix-grouping summary

**SAFE to fix without changing current behavior**
- C3 — rotate + remove the committed PAT (and scrub history).
- H1 — drop the misnamed `weekly_scores` "Service role" backfill policies (verify backfill uses
  the service-role key first).
- H4 (partial) — derive `released_by` from `auth.uid()`; drop the client parameter.
- M1 — set `verify_jwt=true` (or add in-code auth) on `polish-note` / `format-reflection`.
- M4 — stop logging full PII rows in `admin-users`.
- L1 — gitignore `.env`, add `.env.example`.
- L2 — tighten CORS on privileged functions.
- L3 — don't enable Sim tools in production builds.
- H2 — add `is_visible_to_staff = true` to the staff eval SELECT policy (additive; quick verify
  that no participant flow needs pre-release read).

**Needs design discussion / risky (don't hot-patch)**
- C1 — rewrite tenant-table RLS to be org/scope-aware (depends on the scoping model + must run
  after `20260306190002`; touches what every coach/admin can see).
- C2 — add target-org/scope enforcement across all `admin-users` actions (defines the org-admin
  boundary).
- H3 — choose one permission source of truth (`is_*` vs `user_capabilities`) and migrate auth
  consistently — the highest-leverage prerequisite for C1/C2.
- M2 — confirm whether `sequencer-health` / `sync-onboarding-assignments` are deployed; review or
  remove.
- M3 — define fail-closed conventions for `current_user_org_id()` before it's used in policies.

## Caveats / not covered
- Live Supabase security advisors and actual `pg_policies` could not be pulled (MCP tools blocked).
  All RLS findings are reconstructed from migrations read in order; the live DB may contain
  out-of-band policies (notably for `user_capabilities`, which no migration touches). Items marked
  **needs live verification** should be confirmed against `pg_policies` and `get_advisors`.
- `coach_scopes`, `pro_moves` / org overrides, and the doctor/coaching tables were reviewed for the
  same global-flag pattern but are secondary to the staff/evaluation findings; apply the C1 scoping
  approach to them in the same pass.
- Dependency/SCA scanning (npm audit) and live DAST were out of scope.

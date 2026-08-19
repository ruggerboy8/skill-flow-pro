# Codebase assessment, 2026-08-18

**What this is.** The first full engineering review Skill Flow Pro has ever had.
It was produced by the dev workflow kit running on the codebase itself, which was
phase 4 of the kit build. Nine reviewers swept in parallel, all read-only.
**No code was changed by this assessment.**

Most findings became Motion tickets. Six did not, and are marked in the tables
below as `(observation)` with a reason. Those are deliberately untracked: they are
either context worth knowing rather than work to do, or they are already covered
by an existing ticket or an existing document. Nothing in this assessment is
silently dropped, but do not read the tables as "every row is on the board.

**Why it happened.** The project was built entirely in Lovable, then in Claude
Desktop, and is now moving to CLI management. It has never been reviewed
systematically. The goal is a codebase that reads as professional and would hold
up under technical due diligence.

## How this codebase was built, and why it changes the reading

Skill Flow Pro was written almost entirely by AI assistance directed by a founder
who is not a trained engineer, starting early in the era of AI coding tools and
running through several generations of them. That is context, not an excuse, and
it is load-bearing for how this backlog should be worked.

**It explains the shape of what was found.** Nearly every finding here is a
characteristic artifact of generated code that no engineer reviewed, rather than
evidence of carelessness:

- **587 `any` types.** `any` switches TypeScript's checking off. A model reaches
  for it when it does not know the shape of something, which means the type
  system is disabled precisely where the generator was least confident.
- **Three independent implementations of "what is Monday this week."** Each
  session solved the same problem fresh, without knowing the previous solution
  existed.
- **The same security fix reverted three times.** Views rebuilt by later
  generations, each unaware of the January fix.
- **~865 hardcoded colors despite documented token conventions.** The conventions
  exist in CLAUDE.md; generation did not consistently apply them.
- **A dead v1 evaluation surface sitting beside v2.** The new version was
  generated; nothing removed the old one.
- **Eight migrations applied to production but never committed.** A gap in the
  tooling flow, not a decision anyone made.

**The useful question is therefore not "how severe is this" but "will it come
back if I fix it?"** Severity tells you what to do first. Provenance tells you
what *done* means.

### One-time findings

Fix once and they stay fixed. Nothing regenerates them.

GOV-1 missing migrations · SEC-7 leaked token · CLN-3 licensing ·
CLN-4 branch cleanup · COR-3 orphan rows and constraints · CLN-2 dependencies ·
DOC-1 README · GOV-3 branch protection

### Systemic findings, which need a guard rather than a fix

Fixing the instances without adding a guard puts you on a treadmill. For each of
these, the ticket is only complete when something automated fails loudly if the
pattern reappears.

| Finding | The guard it needs |
|---|---|
| SEC-1 anon-readable views (already reverted 3 times) | A check that fails if any public view is anon-readable without `security_invoker`. This is the clearest case in the whole assessment: it has demonstrably come back three times. |
| SEC-2 unguarded `SECURITY DEFINER` functions | A check that fails if a new function grants EXECUTE to `anon` |
| GOV-4 the 587 `any`s | The lint rule enforced in CI, so the count can only go down |
| DSN-3 hardcoded semantic colors | A lint rule banning raw color classes, since the written convention alone has not held |
| COR-1 duplicated date logic | One canonical module, plus a lint rule against the `toISOString` pattern |
| COR-4 split-brain permissions | A test that fails when the two permission systems disagree |
| CLN-1 dead code beside its replacement | A periodic unreferenced-export check |

**A rule of thumb for this codebase:** if a convention lives only in a document,
generation will drift from it. Conventions that matter need to be executable.
CLAUDE.md documents the color tokens and the icon scale; the assessment found
roughly 865 violations of the first and about 1 in 4 declarations off the second.
The documentation is not the problem. The absence of enforcement is.

### On tool capability changing underneath the project

Coding agents are meaningfully more capable now than when this project started,
which cuts two ways worth planning around.

Some of this debt is now cheaper to regenerate than to hand-repair, given the
conventions are written down and a current model can hold far more of the
codebase in view at once. DSN-3 is the obvious candidate: an 865-instance token
migration is miserable by hand and tractable with tooling plus a lint rule to
hold the line.

But capability is also why this assessment could happen at all. Nine reviewers
sweeping a 421-file codebase in parallel, verifying findings against a live
database, was not a realistic option when this project began. The same is true of
the guards recommended above. Several of them were impractical to write and
maintain a year ago and are routine now.

**For due diligence, this framing is an asset rather than a liability.** A
codebase built this way, then systematically audited, with findings tracked and
systemic issues closed with enforcement rather than one-off patches, is a
substantially better story than an unexplained mess. What a reviewer looks for is
not the absence of debt. It is evidence that someone knows where it is and has a
method for retiring it. This document plus the board is that evidence.

## Read this first

If you read nothing else, read these four:

1. **SEC-1 and SEC-2.** Employee names, personal email addresses, and performance
   ratings are currently readable by anyone on the internet with no login. This
   was verified by two independent reviewers who actually ran the queries. It
   spans all four tenants, including Avenue Dental in the UK, which makes it a
   GDPR matter.
2. **SEC-3.** Any logged-in employee can promote themselves to organization
   admin, and from there to platform admin, or relocate themselves into another
   customer's tenant.
3. **GOV-1.** Eight migrations are live in production with no file in this repo.
   If the database were lost, the repo could not rebuild it.
4. **COR-4.** The app's admin UI and the database disagree about who is an admin,
   with three people currently divergent. Removing someone's access in the UI
   does not necessarily remove their access to the data.

## How to read a finding

- **Severity** is rated on engineering health, not on how alarming it sounds.
- **DD-flag: yes** marks findings a technical due-diligence reviewer would
  specifically raise. Some low-severity items carry it (a missing LICENSE file is
  trivial to fix and disproportionately visible), and some high-severity items do
  not (a slow dashboard is a real problem but not a diligence question).
- **Verified** means a reviewer ran a query or a command and saw the result.
  **Inferred** means it was read from code or configuration. This distinction is
  kept throughout because it should change how much you trust each item.

## Method, and its honest limits

Nine parallel read-only reviewers, model-tiered by task: Opus for security and
tenant isolation, Sonnet for data model, tests, design, performance and docs,
Haiku for the mechanical dead-code and dependency passes. Each was pointed at a
specific subset of repo docs and told to report only what it could verify.

**What this assessment did NOT cover.** Stated plainly, because an audit that
implies full coverage is worse than one that admits its edges:

- **Storage buckets were not examined at all.** Not their configuration, not
  their policies. A prior audit mentioned two public buckets; that item no longer
  appears in the current advisor output and was not independently checked.
- **Only about 15 of roughly 85 SECURITY DEFINER functions had their bodies
  read.** The rest were screened for auth references only. There may be more
  unguarded functions than SEC-2 lists.
- **Eleven deployed edge functions have no source in the repo** and therefore
  could not be reviewed at all. Three of them are public. See GOV-2.
- **Roughly 558 migration entries recorded live with an empty name were not
  diffed** against local files. The eight known-missing migrations in GOV-1 are a
  floor, not a ceiling.
- **No dark-mode rendering was actually observed.** Dark-mode conclusions come
  from reading CSS variables and call sites.
- **No contrast ratios were measured** and no browser tooling was used.
- **The privilege escalation in SEC-3 was never executed.** It is confirmed from
  live policy definitions, column grants and trigger definitions, but the write
  was not attempted because the sweep was read-only.
- **Edge function findings come from reading source**, not from sending requests.

The passes ran against live production for schema and policy inspection, using
read-only queries only. Passes 1, 2, 3 and 7 each verified findings directly
against the live database.

## Corrections made to reviewer output

Two agent findings were wrong and were corrected before reaching the board. Both
are recorded here because the corrections matter more than the original claims.

**Dependency severities were inflated.** Pass 8 reported DOMPurify as critical
with 18 vulnerabilities and recommended a version that does not appear to exist.
Verified against `npm audit --json`: DOMPurify is moderate, and **there are zero
critical vulnerabilities in this project.** The agent's totals were right (19
total, 12 high, 7 moderate); its severity ranking was not. It appears to have
counted every advisory in the package's history rather than those affecting the
installed version. CLN-2 uses the verified figures.

**The migration naming counts were backwards, and the rule they support is
stale.** Pass 9 reported 589 hyphen-named files and 17 underscore-named. The
truth is the exact reverse: 17 hyphen, 589 underscore, and **all 17 hyphen-named
files are from a single day, 2025-07-28**, the first day of the project. Lovable
switched to underscore naming around 2025-07-30.

This matters beyond the arithmetic. CLAUDE.md explains that `supabase db push`
does not work here because Lovable's hyphenated filenames are skipped by the CLI.
That reasoning describes 17 files from over a year ago; 97% of migrations are
already in the format the CLI wants. It does **not** follow that `db push` works
now, since migration history may be out of sync for other reasons, and GOV-1
found eight migrations missing from the repo entirely. But the documented blocker
is not the real one, and settling this could remove a large piece of daily
friction. That is DOC-2.

## Findings by pass

### Pass 1: Security and secrets (Opus, verified live)

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Three RLS-bypassing views and two RLS-disabled tables readable by anonymous users | critical | yes | SEC-1 |
| SECURITY DEFINER functions callable by anon, returning names and personal emails; two perform writes | critical | yes | SEC-2 |
| Self-update policy pins 2 of 8 privilege columns, enabling escalation to org admin then platform admin | critical | yes | SEC-3 |
| `deputy-sync-dispatcher` public with service-role key and zero auth | high | yes | SEC-4 |
| `polish-note` and `format-reflection` public, unauthenticated, billing to your AI account | high | yes | SEC-4 |
| `admin-users` cross-org guard on 3 of 11 actions; admin gate admits a coach capability | high | yes | SEC-6 |
| App and database use two disagreeing permission systems | high | yes | COR-4 |
| `config.toml` does not match what is deployed; 11 functions have no source in repo | medium | yes | GOV-2 |
| Supabase management token recoverable from git history and present in a current file | medium | yes | SEC-7 |
| Postgres on a version with published patches; leaked-password protection off; long OTP expiry | medium | yes | SEC-5 |
| Personal data written to function logs on every admin page load | medium | yes | SEC-6 |
| All 36 edge functions allow any origin | low | no | SEC-4 |

**Positive findings.** No SQL injection surface exists: the app uses the Supabase
query builder and RPCs throughout, no edge function builds raw SQL, and no
database function uses `EXECUTE` with concatenation. Every XSS sink is sanitised;
all eight `dangerouslySetInnerHTML` uses in feature code wrap
`DOMPurify.sanitize()`. No service-role key ever reaches client code. Several of
the June audit's worst findings are genuinely fixed and live.

**Why the existing security audit missed all of this.**
`docs/archive/audits/security-rls-audit.md` reviewed only migrations, RLS policies and
edge functions. Views, RLS-disabled tables and SECURITY DEFINER grants were never
in its shape, so **its own regression script would pass cleanly today while
anonymous callers read every tenant's data.** The lesson worth keeping: RLS is
not the only door into the database.

### Pass 2: Multi-tenant isolation (Opus, verified live)

Isolation does not hold. The policies fixed by the June audit are still in place
and still correct, but they are no longer the only path to the data. Three whole
classes of access sit beside RLS and ignore it.

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Views bypass RLS, anon-readable, all tenants (independently confirmed) | critical | yes | SEC-1 |
| Reporting functions run with god-mode and accept any caller-supplied ID | critical | yes | SEC-2 |
| Self-promotion to clinical director / org admin, or relocation into another tenant | critical | yes | SEC-3 |
| `planner-upsert` and `deputy-sync-dispatcher`: service-role, no auth code at all | critical | yes | SEC-4 |
| Edge functions check role but never tenant | high | yes | SEC-6 |
| Clinical and baseline track role-gated but not org-gated | high | yes | SEC-5 |
| Seven more org-scoped tables with no org filter | high | yes | SEC-5 |
| Two leftover recovery tables with RLS disabled | medium | yes | SEC-1 |
| Two competing org resolvers; "org" still means "group" in six DB functions | medium | yes | COR-2 |
| Alcan-specific constants in gates, defaults and fallbacks | medium | yes | COR-2 |
| Two permission systems disagree; 3 org-admin rows divergent live | medium | yes | COR-4 |
| Half of app queries rely entirely on RLS with no second line of defence | low | no | (observation: explains why SEC-1/SEC-2 exposed everything rather than part) |

**The regression chain worth remembering.** The view fix was applied correctly in
January, then silently reverted three times by later migrations that rebuilt those
views, most recently on the same day as the isolation audit itself. Any fix here
needs a guard, or it will come undone a fourth time.

**On `docs/archive/audits/multi-tenant-isolation-audit.md`:** six of its ten remediations are
still live and correct. It is stale in that it audited only tables and edge
functions, its own remediation wave reintroduced a hole, its `admin-users` entry
is too narrow, and its "masquerade hardening" argument is defeated by SEC-3.

### Pass 3: Data model and migrations (Sonnet, verified live)

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Eight migrations live in production with no file in the repo | critical | yes | GOV-1 |
| `weekly_assignments.location_id` has no FK; 108 orphaned rows already exist | high | yes | COR-3 |
| `data-model.md` and `glossary.md` describe dropped or archived tables as live | high | yes | DOC-3 |
| Migration naming and applied-timestamp mismatch make history unreplayable | medium | yes | DOC-2, GOV-1 |
| Generated TypeScript types lag the live schema | medium | no | GOV-1 |
| `staff` has undocumented denormalized org columns with no sync guarantee | medium | no | COR-2 |
| Framework-versioning `change_reason` discipline unproven (not violated) | low | no | (observation: nothing is broken; watch the first framework edit) |
| `user_capabilities` and `organization_pro_moves` lack assumed unique constraints | low | no | COR-3 |

**Framework versioning is working.** The delete-guard and history-capture triggers
are confirmed present and active. The one code path that deletes from `pro_moves`
is correctly scoped to org teardown. No forbidden-delete path exists. The
`app.change_reason` habit simply has not been exercised yet, because no migration
since the system went live actually edits framework content.

### Pass 4: Tests and CI (Sonnet, commands actually run)

**Ground truth, verified by running each command.** `npx tsc --noEmit` exits 0
with zero type errors. `npx vitest run` passes: 1 file, 8 tests. `npm run build`
succeeds. `npm run check` passes clean end to end today. That is genuinely good
news and worth stating: the codebase is not in a broken state.

The problem is coverage, not correctness-as-measured. One test file against 421
source files means almost nothing is protected.

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Sequencer ranking formula has zero tests and is untestable as written | critical | yes | TST-4 |
| Week/cycle math and daily CTA state machine untested, welded to 5+ DB calls | critical | yes | TST-3 |
| Permission and role derivation untested (cheapest high-value test available) | high | yes | TST-1 |
| Three separate untested "start of week" implementations | high | yes | COR-1 |
| Evaluation eligibility untested; it is the denominator of a reported metric | high | yes | TST-1 |
| Dashboard submission-rate math untested | medium | yes | TST-1 |
| Recommender sort/filter/badge logic testable today with no refactor | medium | no | TST-2 |
| No branch protection on `main`; a red CI check does not block a merge | high | yes | GOV-3 |
| CI never runs ESLint | low | no | GOV-3 |
| No Supabase mocking seam blocks testing nearly everything else | medium | yes | TST-5 |
| `pivotStaffDomain` untested | low | no | TST-1 |

**Order these deliberately.** TST-1 and TST-2 need little or no refactoring and
build the habit. TST-3 depends on COR-1 landing first, because testing week math
against three competing Monday implementations would bake in the ambiguity.
TST-4 is the largest single ticket in the assessment.

### Pass 5: Dead code, duplication, branches (Haiku)

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Timezone-unsafe `toISOString` date pattern in 11 files | high | yes | COR-1 |
| Eval Results V1 page and 11 components fully unreferenced | low | no | CLN-1 |
| Two feature libraries written but never wired to anything | medium | no | CLN-1 |
| 130 remote branches, 115 already merged, 14 unmerged | medium | no | CLN-4 |
| Five `.backup` files committed in `src/` | low | no | CLN-1 |
| Deprecated "tenant" terminology in 5 comments | low | no | CLN-1 |
| Two variables named for organizations that actually hold groups | low | no | CLN-1 |
| Feature flag hardcoded `|| true`, env toggle is a no-op | low | no | CLN-1 |
| Eval v2 data-fetch duplication | low | no | (observation: already tracked as finding 8 in code-quality-audit.md) |

**A negative finding worth keeping.** The pass counted roughly 2,459 comment
lines, checked them, and confirmed they are real documentation rather than
commented-out code. Only three TODO/FIXME markers exist in the whole codebase.
That is a genuinely well-commented codebase, and a lazier review would have
reported the raw number as debt.

### Pass 6: Design system, dark mode, accessibility (Sonnet)

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Domain color helpers are static; dark mode broken across 60 files | high | yes | DSN-1 |
| 36 of 58 icon-only buttons have no accessible name | high | no | DSN-2 |
| ~865 hardcoded semantic colors across 97 files | high | yes | DSN-3 |
| `StatusBadge` exists but is bypassed by hand-rolled pills | medium | no | DSN-4 |
| Nine `<h1>` tags on one page in the review flows | medium | no | DSN-2 |
| Icon sizes: ~1 in 4 declarations off the documented scale | low | no | DSN-4 |
| A second, undocumented type scale in the newer mobile pages | low | no | DSN-4 |
| `CaptureTour.tsx` overlay bypasses the accessible Dialog primitive | medium | no | DSN-2 |
| Hardcoded `bg-white` / `text-white` outside dark guards | low | no | DSN-3 |
| ~60 files use `cursor-pointer` on a div with no button role | medium | no | DSN-2 |

**Two positive findings.** First, colour is never the sole information carrier:
score colours are always paired with a distinct icon shape or the numeric score,
and domain badges always render the domain name as text. So the colour findings
above are consistency debt, **not** a colour-blindness accessibility failure.
Second, the previous accessibility audit's worst bugs are genuinely fixed. The
rating control's label is correct now, and the two keyboard-unreachable cards it
flagged now carry proper role, tabIndex and key handlers. The audit document is
what is stale, not the code.

**One caution carried into DSN-1.** `domainColors.ts` contains a comment saying
the static helpers "intentionally stay static-fallback-only" so older screens
render byte-identically. That is a deliberate decision someone made, not an
oversight, and a blind migration may change screens that were frozen on purpose.

### Pass 7: Performance and data fetching (Sonnet, EXPLAIN ANALYZE against live)

This pass produced the strongest evidence of any: real query plans, real advisor
output, and a real production build.

**Live row counts, useful for calibrating every other finding:** `weekly_scores`
~6,248, `weekly_assignments` ~1,414, `evaluation_items` 1,696, `pro_moves` 332,
`competencies` 126, `staff` 113, 79 active participants, `domains` 4.

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| Dashboards fire one DB round-trip per staff member (measured: 72ms, 17,436 buffer reads each) | high | no | PRF-1 |
| 145 RLS policies re-evaluate auth per row; 243 stacked permissive policies | high | no | PRF-2 |
| Single 3.4MB bundle (959kB gzipped), no route-level code splitting | high | no | PRF-3 |
| Confidence repair flow chains up to 4 sequential DB calls | medium | no | (observation: subsumed by the planned legacy cycle retirement) |
| Duplicate indexes on the busiest write table | low | no | COR-3 |
| `ProMoveForm` N+1 against a 4-row table | low | no | CLN-1 |
| Unindexed foreign keys on the two busiest tables | low | no | COR-3 |
| ~30 files `select('*')` where a few columns would do | low | no | (observation: no measured impact at current row counts) |
| No list virtualization anywhere | low | no | (observation: no screen renders enough rows to need it yet) |

**Calibration worth noting.** This pass was careful to distinguish real pain from
theoretical pain. It explicitly reported that unindexed foreign keys are *not*
currently causing a slow query, and that no screen renders enough rows to need
virtualization yet. Both were flagged as pre-growth work rather than urgent. That
restraint is why its high-severity findings should be believed.

### Pass 8: Dependencies and licensing (Haiku, corrected)

See "Corrections" above. Verified totals from `npm audit --json`: **0 critical,
12 high, 7 moderate, 19 total, all with a fix path.**

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| 19 dependency vulnerabilities, 4 in direct production dependencies | high | yes | CLN-2 |
| No LICENSE file and no `license` field in package.json | high | yes | CLN-3 |
| GSAP ships under a custom non-SPDX license in `the-alcan-way/` | medium | yes | CLN-3 |
| `@supabase/supabase-js` significantly outdated (staleness, not a vulnerability) | medium | no | CLN-2 |

**Positive finding.** Both lockfiles are committed and there are no git-URL
dependencies, which is correct supply-chain practice.

### Pass 9: Docs, operability, `the-alcan-way/` (Sonnet)

The central question this pass answered: could a competent engineer who has never
seen this project set it up, run it, and safely ship a change using only the
documentation in this repo? **Today, no.**

| Finding | Sev | DD | Ticket |
|---|---|---|---|
| `architecture.md` gives a deploy instruction CLAUDE.md says is broken | high | yes | DOC-2 |
| README is untouched Lovable boilerplate; no `.env.example`; `.env` tracked | high | yes | DOC-1 |
| No production error monitoring, health check, or rollback runbook | high | yes | DOC-4 |
| `roadmap.md` claims to be updated every session, 5+ months stale | high | yes | DOC-3 |
| `architecture.md` stale banner undersells how wrong it is | high | yes | DOC-3 |
| `kit-log.md` specified by the kit instructions but never created | medium | no | (fixed in this PR) |
| `docs/archive/audits/` mixes trustworthy and stale docs with no consistent banners | medium | yes | DOC-3 |
| `.env` committed and not gitignored | low | yes | DOC-1 |
| `the-alcan-way/` dormant, no deploy path, unreferenced from the app | medium | no | CLN-5 |
| Key-person risk concentrated in CLAUDE.md | high | yes | DOC-1, DOC-3 |
| A documented feature flag is dead; two live flags are undocumented | low | no | DOC-3 |
| `enterprise-blockers.md` stale but operationally important | medium | no | DOC-3 |

**The key-person finding deserves emphasis.** Several load-bearing facts exist
only in CLAUDE.md, which is not a file most engineers would think to open: the
migration and `db push` situation, the fact that Lovable owns migrations and
commits to main automatically, and the current Organization/Group/Location
terminology that `roadmap.md` still contradicts. An engineer without access to
you and without reading CLAUDE.md cover to cover would very likely try
`supabase db push` and get stuck silently, then use outdated terminology
inherited from the roadmap. None of it is unrecoverable, but all of it currently
routes through one person.

**The kit itself checks out.** Pass 9 verified that all six SKILL.md files, the
shared doc-routing table, the guard hook and its settings wiring, and the ticket
template all exist as specified. `kit-log.md` was the only missing artifact, and
it is created alongside this document.

## Ticket index

Thirty-six tickets on the MyProMoves Dev Board. (GOV-3 was split into GOV-3 and
GOV-4 after John flagged that gating CI on lint would block every merge. He was
right: there are 2,457 lint errors today. See GOV-4.)

**Security (7):** SEC-1 anon read surface · SEC-2 SECURITY DEFINER grants ·
SEC-3 privilege escalation · SEC-4 unauthenticated edge functions ·
SEC-5 org-scope unfiltered policies · SEC-6 admin-users guards and logging ·
SEC-7 leaked token cleanup

**Governance (4):** GOV-1 backfill missing migrations · GOV-2 recover orphaned
edge functions · GOV-3 branch protection · GOV-4 lint config and debt

**Correctness (4):** COR-1 timezone dates and Monday consolidation ·
COR-2 org-vs-group ID confusion · COR-3 database integrity ·
COR-4 split-brain permissions

**Tests (5):** TST-1 cheap pure logic · TST-2 recommender utils ·
TST-3 week/cycle math · TST-4 sequencer formula · TST-5 Supabase test double

**Performance (3):** PRF-1 batch dashboard queries · PRF-2 per-row RLS ·
PRF-3 bundle splitting

**Design (4):** DSN-1 dark-mode domain colors · DSN-2 accessibility ·
DSN-3 color token migration · DSN-4 status pills and scale drift

**Docs (4):** DOC-1 README and env · DOC-2 settle `db push` ·
DOC-3 staleness sweep · DOC-4 error monitoring

**Cleanup (5):** CLN-1 dead code · CLN-2 dependencies · CLN-3 licensing ·
CLN-4 branches · CLN-5 the-alcan-way

**Severity spread:** 6 critical, 21 high, 8 medium, 1 low.

## A suggested order

Not prescriptive, but the dependencies are real:

1. **GOV-3** first. It is mostly a settings change, low risk, and it makes every
   later merge safer.
2. **SEC-1** next. Small, self-contained, and it closes the live exposure.
3. **GOV-1**, because DOC-2 and any migration work depend on the repo matching
   production.
4. **SEC-3 before COR-4.** SEC-3 is smaller and closes the active hole; doing
   COR-4 first means touching the same policies twice.
5. **COR-1 before TST-3**, so week math is consolidated before it is tested.
6. **SEC-5 and COR-4 before PRF-2**, so the RLS policies are not rewritten twice.

CLN-1 and TST-2 are the two easiest tickets on the board and are good first
practice reps if you would rather start somewhere low-stakes.

## Appendix: source locations

Added after review feedback on PR #11 pointed out, correctly, that the tables
above give counts and component names rather than the file references the spec
promised. Full detail including line numbers lives in each Motion ticket; this is
the quick lookup.

**SEC-1** views `view_evaluation_items_enriched`, `view_weekly_scores_with_competency`,
`view_staff_submission_windows`; tables `eval_payload_recovery_backup`,
`_eval_repair_targets`. Regression trail: fixed in
`20260106174259_d56cb614-*.sql:8`, reverted by `20260204222301_c756ff5d-*.sql:4-6`,
`20260305215452_158aa2b6-*.sql:14-47`, and `20260612170000_org_move_visibility.sql:17`.
Public key at `src/integrations/supabase/client.ts:6`.

**SEC-2** `get_staff_all_weekly_scores`, `get_coach_roster_summary`,
`get_staff_submission_windows`, `get_calibration`, `get_eval_distribution_metrics`,
`get_location_domain_staff_averages`, `get_location_skill_gaps`,
`get_performance_trend`, `get_evaluations_summary`, `get_best_weekly_win`,
`org_visible_pro_moves`. Write functions: `save_eval_acknowledgement_and_focus`
(4-arg overload), `admin_fix_backfill_week_of`. Callers include
`src/hooks/useStaffAllWeeklyScores.tsx:56`, `src/components/coach/OnTimeRateWidget.tsx:30`.

**SEC-3** policies `staff / "Users can update own profile"` and
`"Users can create own profile"`; `public.is_coach_or_admin(uuid)`;
`uc_admin_write` on `user_capabilities`; trigger `trg_staff_fill_organization_id`;
`supabase/functions/admin-users/index.ts:79`; `src/hooks/useUserRole.tsx:60`.

**SEC-4** `supabase/functions/deputy-sync-dispatcher/index.ts:35-113`,
`supabase/functions/planner-upsert/index.ts:72-77` (body-supplied orgId at `:218`,
updaterUserId at `:229`), `supabase/functions/polish-note/index.ts`,
`supabase/functions/format-reflection/index.ts`, `supabase/config.toml:49-50,55-56,97-98`.

**SEC-5** `coach_baseline_assessments`, `coach_baseline_items`, `coach_baseline_audit`,
`doctor_baseline_assessments`, `doctor_baseline_items`, `doctor_coach_assignments`,
`coaching_session_selections`, `user_capabilities`, `excused_weeks`, `staff_audit`,
`reminder_log`, `staff_quarter_focus`, `app_kv`, `organization_role_names`.

**SEC-6** `supabase/functions/admin-users/index.ts`: guard defined `:92-114`, called
`:624`, `:1023`, `:1097`; missing from `:533`, `:970`, `:992`, `:1181`. Gate `:68-80`.
PII logging `:41`, `:54`, `:110`, `:1017`, `:1197`.

**SEC-7** `docs/archive/audits/security-rls-audit.md:142`; commits `8ef83ac0`, `f8d25bdd`,
`d86d4934`, `1d67e693`, `b130d7c5`.

**COR-1** `src/hooks/useWeeklyAssignments.tsx:75`, `WeekBuilderPanel.tsx`,
`GlobalAssignmentBuilder.tsx`, `MonthView.tsx`, `HistoryStrip.tsx`,
`useStaffSubmissionRates.tsx`, `ScoreHistoryV2.tsx`, `submissionRateCalc.ts`, plus 3
more. Monday implementations: `src/lib/submissionPolicy.ts:109` (canonical),
`src/lib/dateUtils.ts`, `src/lib/plannerUtils.ts:9-75`. Correct pattern to copy is in
`src/lib/locationState.ts`.

**COR-2** `get_staff_domain_avgs`, `get_strengths_weaknesses`,
`get_eval_distribution_metrics`, `get_location_domain_staff_averages`,
`seq_latest_quarterly_evals`, `get_coach_roster_summary`,
`is_org_allowed_for_sequencing`; resolvers `current_user_org_id()` vs
`get_user_org_id(uuid)`; caller example
`src/components/admin/eval-results-v2/OrgSummaryStrip.tsx:42`. Alcan constants:
`src/lib/askAlcanAccess.ts:6`, `src/components/RequireAccess.tsx:71`,
`src/components/Layout.tsx:192`, `src/hooks/useAlcanTargets.ts:20,38`,
`src/pages/admin/SurveyBuilderPage.tsx:94`,
`supabase/functions/deputy-initiate-oauth/index.ts:96`,
`supabase/functions/deputy-oauth-callback/index.ts:49`,
`supabase/functions/send-hr-export/index.ts:31`,
`supabase/functions/admin-users/index.ts:410-411`,
`src/lib/content/roleDefinitions.ts:65-69`, `src/lib/plannerUtils.ts:4`,
`src/lib/centralTime.ts:5`, `supabase/functions/transcribe-audio/index.ts:42`.

**COR-3** `weekly_assignments.location_id`, `weekly_scores.assignment_id`,
`weekly_scores.weekly_focus_id`; indexes `idx_weekly_scores_focus_id` /
`idx_weekly_scores_focusid`, `uq_weekly_scores_staff_focus` /
`weekly_scores_staff_id_weekly_focus_id_key`; tables `user_capabilities`,
`organization_pro_moves`.

**COR-4** `src/hooks/useUserRole.tsx:43-100`; `is_coach_or_admin(uuid)`,
`is_super_admin(uuid)`, `is_superadmin()`; `supabase/functions/admin-users/index.ts:48-80`.

**TST-1** `src/hooks/useUserRole.tsx:60-155`; `src/lib/evaluationEligibility.ts:10-26,33-38,49-72`;
`src/lib/evaluations.ts:779-816`; `src/lib/submissionStatus.ts:39-53,55-149`;
`src/lib/submissionRateCalc.ts:27-99`; `src/lib/pivot.ts:29-85`.
**TST-2** `src/lib/recommenderUtils.ts:5-27,44-79,95-175`.
**TST-3** `src/lib/locationState.ts:37-88` and `:240-536`.
**TST-4** `supabase/functions/sequencer-rank/index.ts:428-600`.
**TST-5** `src/integrations/supabase/client.ts`, `vitest.config.ts`.

**PRF-1** `src/hooks/useStaffSubmissionRates.tsx:42-65`,
`src/hooks/useOrgAccountability.tsx:93-139`, `src/hooks/useLocationAccountability.tsx:79+`,
`src/components/dashboard/LocationSubmissionWidget.tsx:63-83`,
`src/components/dashboard/DomainConfidenceHeatmap.tsx:59-69`; RPC
`get_staff_submission_windows`.
**PRF-3** `src/App.tsx` (67 static imports), `dist/assets/index-*.js`.

**DSN-1** `src/lib/domainColors.ts`; safe variants used only in
`src/components/my-role/CraftAtlasOverview.tsx`, `CraftAtlasArea.tsx`.
**DSN-2** `src/components/dashboard/ExcuseSubmissionsDialog.tsx:254,260`,
`src/components/clinical/DoctorDetailThread.tsx:477`,
`src/components/admin/AdminUsersTab.tsx:575`, `src/components/coach/AudioRecorder.tsx`,
`src/pages/doctor/DoctorReviewPrep.tsx`, `src/pages/EvaluationReviewV2.tsx:272,292,316,331,364,389,415,469,513`,
`src/pages/EvaluationReview.tsx`, `src/components/coach/CaptureTour.tsx`.
**DSN-3** worst files `src/pages/Index.tsx`, `src/components/dashboard/EvalCadenceWidget.tsx`,
`SignalsBanner.tsx`, `LocationSubmissionWidget.tsx`, `src/components/coach/OnTimeRateWidget.tsx`,
`src/components/admin/eval-results-v2/DeliveryStatusPill.tsx`, `src/pages/coach/EvaluationHub.tsx`.
**DSN-4** `src/components/ui/StatusBadge.tsx` and the hand-rolled versions listed in DSN-3.

**DOC-1** `README.md`, `.env`, `.gitignore`.
**DOC-2** `docs/archive/architecture.md:25-26` vs CLAUDE.md "Applying migrations".
**DOC-3** `docs/archive/roadmap.md`, `docs/archive/architecture.md:138`, `docs/archive/data-model.md`,
`docs/archive/glossary.md`, `docs/archive/audits/*`, `docs/archive/enterprise-blockers.md`, `docs/archive/phase2-qa.md`.

**CLN-1** `src/pages/admin/EvalResults.tsx`, `src/components/admin/eval-results/*`,
`src/index.backup.css`, `src/components/ui/button.backup.tsx`, `card.backup.tsx`,
`src/components/home/ChristmasWelcome.backup.tsx`, `RecentWinBanner.backup.tsx`,
`src/lib/participation.ts`, `src/lib/backfillDetection.ts`, `src/lib/featureFlags.ts:2`,
`src/components/admin/ProMoveForm.tsx:139-149`,
`src/components/admin/eval-results-v2/DeliveryTab.tsx`, `src/pages/coach/CoachDashboardV2.tsx`.
**GOV-4** `eslint.config.js:8`, `.claude/worktrees/*`.

# Redesigning How Skill Flow Pro Gets Developed and Shipped

**Status:** v1, 2026-08-18. Analysis and recommendation written by Claude
Code at John's request, from first-hand inspection of this repo and the
autoDev repo (`eschnei/autodev`, cloned and read). It is a proposal to
react to, not a decision.

---

## 1. Diagnosis: how this project actually ships today

Reconstructed from the repo, not from memory.

**The pipeline as practiced:**
John (intent, in chat) → Claude Code (edits + commits + `git push` to
`main`) → GitHub `main` → Lovable auto-syncs `main` into its project and
rebuilds its preview → John clicks through the preview → Lovable
**Publish** → production. Supabase changes ride alongside: DDL via the
dashboard SQL editor or the MCP tool (hits prod instantly), edge
functions via Lovable's auto-deploy on rebuild.

**Who does what:**
- *Claude Code* is the entire engineering department: design docs,
  prototypes, executor specs, the code, the commits, the pushes. In the
  last two weeks it also spawned Sonnet subagents to build from written
  specs and audited their output.
- *GitHub* is a transport layer and a history, not a review surface.
  Evidence: the repo has **5 pull requests in its lifetime**, the last in
  June; the recent stretch of work landed as **42 direct commits to
  `main`, zero PRs**. There is no CI, no branch protection, and no
  required checks.
- *Lovable* is three things at once: the production deployer (Publish),
  the pre-production review environment (its preview of `main`), and a
  second author. Of the last 300 commits on `main`, **164 are Lovable's
  bot**, and **123 of those are titled "Changes"**, opaque and
  unreviewable after the fact.
- *John* makes decisions at exactly two points: describing intent up
  front, and eyeballing the Lovable preview before Publish. Everything in
  between is trusted.

**Engineering safety nets that exist:** TypeScript strict-ish typecheck
(clean today), ESLint config, a rich set of design/architecture docs, and
Claude's own build-then-verify habit. That's it.

**Safety nets that do not exist:** automated tests (**zero** test files
in `src/`), CI, PR review, branch protection, a staging database, a
non-production Supabase project, and, most importantly, any structural
guarantee that what John previews is what Publish ships.

**Where the risk and ambiguity actually live:**
1. **`main` is production-adjacent with no gate.** Every push is one
   Publish click from live, and Lovable's preview shows the moving head
   of `main`, so a half-finished multi-commit change is what John sees.
2. **The preview-then-Publish loop is only as safe as John's attention.**
   It catches visual/interaction defects on the surfaces he clicks; it
   cannot catch a regression on a surface he didn't click, a broken edge
   case, or a data-layer bug that only fires for a role he isn't logged
   in as. The lead-account duplicate-competency bug is a perfect example:
   it shipped, and was found by John testing as a specific persona.
3. **The database has no safety at all.** DDL goes straight to prod. The
   CLAUDE.md rule "column drops must lag deployed code" exists precisely
   because a schema change once broke the live app.
4. **Two authors, one branch, no coordination.** Lovable's bot and Claude
   Code both write to `main`. The 82-commit drift Claude had to merge
   this week was pure luck to resolve without conflicts.
5. **Verification is asserted, not proven.** Subagent reports said "pass
   by code inspection, not verifiable live" a lot this week. Honest, but
   it means the first real test of every build is John's phone.

The current process is fast and it has worked, but it works because
one careful reviewer (Claude) plus one attentive product owner (John)
have been standing in for tests, review, and staging. That scales badly
as the app grows and as more of the build is delegated to subagents.

## 2. Assessment of autoDev

Read first-hand: README, docs, the five commands (`init`, `new`, `loop`,
`qa`, `repro`), the operating manual, guarantees, config example, hooks.

**What it is.** A Claude Code plugin implementing a PM → dev → QA
pipeline: `/autodev:new` describes a feature, `/autodev:loop` advances
one step per call (spec/PRD → your approval, Gate 1 → ticket breakdown →
per-ticket build in its own git worktree by a specialist agent that must
ship tests → QA by fresh agents from three angles → draft PR per ticket
with a manual test script → you accept a *running* preview and merge,
Gate 2). Plus `/autodev:qa` (adversarial deep QA, countersigned by a
second fresh agent) and `/autodev:repro` (turn "X is broken" into a
reproduced ticket with a failing test first). A local git-native board
tracks state under `.autodev/`; Linear/Shortcut optional. Only humans
merge; the engine only opens *draft* PRs. Nothing runs between loop
calls.

**Where it genuinely adds value over how we work:**
- *The two gates are exactly the right two.* Approve the plan before
  code; accept a running product before merge. We already do a version
  of Gate 1 (the executor specs) and Gate 2 (Lovable preview), but
  autoDev makes them structural instead of habitual.
- *Fresh-agent QA that didn't write the code, from three angles* (meets
  the criteria / can it be broken / did anything regress). This is the
  single biggest thing we lack. Our subagents self-report.
- *Tests as a ship requirement per ticket.* We have zero tests. Even a
  thin regression net changes what "done" means.
- *Repro-first bug fixing.* A failing test committed before the fix,
  verified red → green. Our bug fixes are currently "Claude read the code
  and believes it's fixed."
- *Worktree isolation per ticket* and *human-only merge* — discipline we
  have skipped entirely.
- *"Ask, don't invent"* as an enforced rule, with a Blocked state.

**Where it duplicates what Claude Code already does well:** plan mode,
subagents, worktrees, custom skills, hooks. autoDev is mostly
prompt-engineering plus shell scripts arranged into a state machine on
top of those primitives. That's not a criticism — the arrangement *is*
the value — but it means the ideas are portable without the plugin.

**Where it adds ceremony:** its own README says a small feature is "≈ a
dozen" loop calls, each a human turn. There is no fast path for a
one-line copy change; everything is a feature with a PRD. For the
tweak-heavy way this project evolves (copy, tint, one card's order),
that overhead would dominate.

**Maturity and trust (as of 2026-08-18):** created 2026-06-15, **6 stars,
4 forks, 3 contributors, 101 commits, last push 2026-07-31**, Apache-2.0,
zero open issues, no releases cadence to speak of. It has real tests for
itself and a serious operating manual, and its design is unusually
principled. It is also two months old, essentially single-maintainer,
and quiet for the last three weeks. That's a "learn from and maybe use
one command from" level of trust, not a "route all development through
it" level.

**Its assumptions, and where they collide with this repo:**

| autoDev assumes | This repo | Verdict |
|---|---|---|
| A GitHub remote + `gh` (or `local_diff`) | Yes, present | fine |
| Node 18+, `jq`, `git` | fine | fine |
| A test runner the ticket agent can add tests to | **none exists** | bootstrap needed first |
| **Hermetic runs: `doctor` FAILS if prod endpoints are in `.env` and hermetic overrides are off** | `.env` points at the one and only Supabase project, which is production; there is no staging DB | **hard conflict**: to run at all it needs a local Supabase (`supabase start`) or a second project, plus env overrides |
| Preview = it launches your app locally (`commands.app_run` + `app_url`) and hands you `localhost` | Vite dev server works locally, but the app is only meaningful against real data | preview would show a *hermetic* app; against a local Supabase, that means empty or seeded data, not John's world |
| Feature branches + draft PRs, merge in GitHub | possible; unused today; **Lovable syncs one branch at a time** | workable but interacts with Lovable (section 3) |
| CI/post-merge clean-room verify | no CI; it does its own local verify | fine, degrades gracefully |
| Migrations/secrets handled by the repo's own tooling | Lovable owns migrations; DDL via dashboard/MCP; `db push` doesn't work here | autoDev has no opinion; the DB path stays manual regardless |
| CLAUDE.md is read-only to the AI | fine, matches our practice | fine |

The hermetic conflict is the important one. It isn't a bug in autoDev,
it's the correct instinct ("QA never touches production") running into
the fact that this project has never had anything but production. Any
serious QA discipline, autoDev or homegrown, forces the same
prerequisite: **a non-production Supabase environment.**

## 3. Lovable mechanics, and the flow that is actually viable

Verified against Lovable's docs and current behavior:

- Lovable syncs and edits **one branch at a time**, the repo's default
  branch (`main`) unless switched.
- **Branch switching exists** (Labs feature): a branch picker; switching
  makes Lovable immediately edit, sync, and preview *that* branch. New
  branches are created from the *currently active* branch. You cannot
  switch while Lovable is mid-edit.
- Lovable has **no per-branch preview environments** and no staging.
  There is one preview, of the active branch.
- **Publish deploys a snapshot of the current project, i.e. the active
  branch.** This is the trap: if you switch Lovable to a feature branch
  to review it and then click Publish, you ship the branch to production.

So the requested flow —
*feature request → planning → dev/QA → feature branch/draft PR → Lovable
preview → acceptance → merge → Publish* —
is viable **with one discipline added**: Lovable's preview of a branch is
for review only, and the human sequence is
**review on branch → switch Lovable back to `main` → merge the PR on
GitHub → Lovable re-syncs `main` → Publish.**
Publish is only ever clicked with Lovable pointed at `main`. That's the
whole safety rule, and it's learnable.

Two more mechanics matter:
- Lovable's bot commits to whatever branch is active. Any time John does
  Lovable-side edits, they land on the active branch. Keep Lovable on
  `main` except during a review window, and the two-authors problem
  stays contained.
- Since Lovable's preview is the *only* place the app runs against real
  data, it stays our acceptance environment for anything data-shaped.
  `localhost` (Claude's own dev server, or autoDev's preview) is fine for
  layout and flow, and blind to real-data behavior.

## 4. Recommendation: which of the five postures

**Option 4, borrow the patterns, with a slice of option 3.** Do not
adopt autoDev as the primary interface. Do not adopt it as a general
"feature mode" yet. Concretely:

- Adopt its *architecture* — plan gate, ticket decomposition, isolated
  branch per unit of work, fresh-agent QA, tests as a ship requirement,
  repro-first bugs, human-only merge, running-product acceptance — as our
  own light workflow built from Claude Code primitives we already use
  (executor specs, subagents, worktrees, `gh`).
- Trial exactly two of its commands where they're self-contained and low
  risk: `/autodev:repro` on the next real production bug, and
  `/autodev:qa` on one finished feature, *after* the hermetic
  prerequisite exists. If those earn their keep, revisit fuller adoption
  when the project is older and this repo has tests.

Why not full adoption now: the hermetic requirement can't be met today,
the ceremony is wrong for our change mix, and the project's maturity
doesn't justify routing everything through it. Why not "do nothing": the
diagnosis above.

## 5. The target workflow, operationally

Three lanes by size, one lane for bugs, and a fixed checklist before
Publish. "Claude" below means Claude Code in a terminal in the repo.

**Standing rules (all lanes):**
- Lovable stays pointed at `main` except inside a review window.
- Claude never pushes to `main` directly. All code lands via a branch
  and a PR that John merges. (Docs-only commits may go direct.)
- Nothing DB-shaped happens without John's explicit "yes": schema
  changes are proposed as a migration file in the PR *and* an
  idempotent SQL snippet, and applied to prod by John (dashboard) after
  the code that tolerates them is deployed, never before (existing
  CLAUDE.md rule).
- Every PR description carries a **do-X-expect-Y acceptance script**
  written for John, not for a developer.

**Lane 1, tiny (copy, spacing, a token, one card's order):**
Claude: makes the change on a short branch, runs build + typecheck +
lint, opens a PR with a two-line acceptance note, and tells John.
GitHub: PR. Lovable: no branch switch needed for pure copy/style; John
merges, `main` re-syncs, John glances at the preview, publishes. John
inspects: the one thing that changed. Cost: two extra clicks over today
(merge, then publish). Gain: a paper trail and a revert button per
change.

**Lane 2, medium (a new page, a new card family, a hook change):**
Claude: writes a short spec (what/why/acceptance script/out-of-scope),
John approves it in chat (Gate 1). Claude builds on a branch (itself or
a Sonnet subagent from the spec, as this week), adds at least smoke
tests for the new logic, then a **second, fresh subagent QAs it against
the spec's acceptance script** and reports pass/fail per item. PR opens
with both the build report and the QA report. John: switches Lovable to
the branch, walks the acceptance script in the preview, switches Lovable
back to `main`, merges, publishes (Gate 2).

**Lane 3, cross-cutting (the mobile shell, an IA change, anything
touching auth/roles/data model):**
Everything in lane 2, plus: the spec is decomposed into tickets with an
explicit order and dependency notes (exactly what
`mobile-build-instructions.md` was); each ticket is one commit; the QA
pass includes an adversarial "try to break it" and a regression walk of
adjacent surfaces (the round-3 route sweep is the pattern); the PR is
merged only after John's persona-specific acceptance (participant AND
lead AND, where relevant, admin on desktop). If a schema change is
involved, it ships as its own PR ahead of the code that needs it.

**Bugs in production:**
1. John describes the symptom in plain language, including which account
   and which screen. 2. Claude reproduces first: identifies the failing
   path and, where feasible, writes a failing test (or a documented
   manual repro) *before* touching the fix. Never "I read the code and
   believe it's fixed." 3. Fix on a branch, PR with the repro → green
   evidence, John verifies on the Lovable branch preview as the affected
   persona, merges, publishes. 4. If it's a data-only problem, Claude
   proposes the SQL and John runs it, with a SELECT-first check.

**Before Publish, every time (the checkpoints):**
1. Lovable's branch picker says `main`. 2. The PR was merged, not just
   pushed. 3. Build/typecheck were green on the PR. 4. The acceptance
   script was walked, on the preview, as the right persona(s). 5. Any
   DB change was applied in the agreed order. 6. There's a known way
   back (revert the PR; Lovable Publish history as a second net).

## 6. The minimal skill set (12 things)

Concepts, not a curriculum. Claude does the typing; John needs to
*recognize* these.

1. **Terminal basics:** open Terminal, `cd` into the repo, launch
   `claude`. That's the whole CLI habit.
2. **What a branch is:** a parallel line of work; `main` is the one
   Lovable and production follow.
3. **`git status`** and **`git log --oneline -10`**: "what's changed,
   what landed." Read-only, safe to run anytime.
4. **What a PR is** and how to read one on GitHub: the description
   (Claude writes it for you), the Files changed count, the checks.
5. **Merging a PR on GitHub** (the green button) and why merge ≠ push.
6. **`gh pr list` / `gh pr view <n> --web`**: see open work and open a
   PR in the browser from the terminal.
7. **Reverting:** "revert this PR" (Claude runs `gh pr revert` or a
   `git revert`); the concept that history is append-only and reverts
   are safe.
8. **Lovable's branch picker:** switch to a branch to review, switch
   back to `main` before Publish. The one rule that prevents shipping a
   branch.
9. **The difference between preview and Publish** in Lovable, and that
   Publish is a snapshot of the active branch.
10. **`npm run build`** as the meaning of "it compiles"; you'll see
    Claude run it, you don't need to.
11. **Claude Code plan mode** (`shift+tab` cycles): reading a plan and
    saying yes/no is Gate 1.
12. **Reading a QA report** for pass/fail per acceptance item and the
    "not verifiable" list; the "not verifiable" list is your test plan.

Deliberately not on the list: rebase, stash, cherry-pick, resolving
conflicts by hand, git internals. Claude handles those; if one ever
needs John, Claude explains it in the moment.

## 7. Prerequisites to build first (small, one-time)

1. **A test runner.** Add Vitest + Testing Library, one config, one
   example test. Half a day. Without this, "tests as a ship requirement"
   is a slogan.
2. **A tiny CI.** One GitHub Actions workflow: install, typecheck, lint,
   build, test, on every PR. Turn on "require checks to pass" for
   `main`. Half a day. This is what turns the PR into a real gate.
3. **A non-production Supabase.** Either local (`supabase start -x
   vector,logflare`, per the global notes) or a second hosted project,
   with a `.env.local` that points at it. This is what makes any real QA
   (ours or autoDev's) safe, and it's the prerequisite for ever seeding a
   lead account with data without touching prod. Bigger job; can trail
   items 1-2.
4. **Branch protection on `main`:** require a PR, require the check.
   Ten minutes, and it makes the standing rules mechanical.

## 8. Pilot: the Alcan Way exhibit, Gallery 1

**Why this one:** it's the next real feature; it's medium-to-large but
almost entirely *additive* (new components, new route, no changes to
check-in/out, evaluations, or roles), so a failure can't break the
working app; it's mobile-shell-gated so non-flagged users can't see it;
it has a natural ticket decomposition (exhibit entry, station component,
three Check-In stations, coach send link); its acceptance is intensely
visual, which is exactly what the Lovable branch-preview review needs to
prove out; and John is co-authoring the content anyway, so Gate 1 will
be a real conversation, not a rubber stamp.

**How we'd run it:**
1. Prereqs 1, 2, and 4 land first, in their own tiny PRs (the pilot's
   warm-up: John's first three merges).
2. Claude drafts the Gallery 1 spec: content model, the station
   component contract, tickets, and John's acceptance script per station.
   John approves in plan mode (Gate 1).
3. Build on `feature/alcan-way-gallery-1`, one commit per ticket, on a
   worktree, with component tests for the station's three layers.
4. Fresh-agent QA against the acceptance script plus a "try to break it"
   pass; PR opens with both reports.
5. John switches Lovable to the branch, walks the script on his phone as
   Testing Tester, switches Lovable back to `main`, merges, publishes.
6. Retrospective in one page: what the gates caught, what they cost, and
   whether `/autodev:qa` on this feature would have added anything.

**Risk containment:** nothing in the pilot touches the DB; the feature is
flag-gated; the branch never becomes `main` until John merges; and if
the branch preview misbehaves, the fallback is what we do today.

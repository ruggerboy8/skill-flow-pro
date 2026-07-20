# PRD: Ariyana's Coaching Workspace

**Status**: Draft — key decisions locked
**Author**: Alex (Product) — drafted with John (owner)  **Last Updated**: 2026-07-20  **Version**: 0.2
**Stakeholders**: John (owner/eng), Lovable (frontend), Ariyana (primary user / design partner), Dr. Alex & Dr. Casey (clinical directors, secondary)

> **Decisions locked (2026-07-20):**
> 1. **"Build the lead meeting" is STANDALONE for MVP** — Ariyana builds a "this
>    week's focus" view; injecting it into the leads' live facilitation flow
>    (`FacilitatePage`) is a fast-follow, not MVP. Do not touch the live meeting yet.
> 2. **Focus items are free-text (lay terms) with an OPTIONAL nullable `pro_move_id`** —
>    flexible now, enables lead self-grading later without forcing a Pro Move link.
> 3. **Low-confidence aggregation grain = per location × Pro Move, minimum N = 3
>    people** before a signal surfaces, so it can never re-identify the one person
>    who admitted a low score.
> 4. **Access is Ariyana-scoped for now** (gated like the Ask Alcan surface),
>    generalizable to other training directors later.
> 5. **Canonical spelling is "Ariyana"** (`facilitator-presentation.md`'s "Ariana"
>    is a pre-existing typo to fix in passing).

> **Press-release paragraph (the "why users will care"):** Ariyana runs the one
> coaching cascade in ProMoves that actually works — the RDA line — and she runs
> it out of sticky notes, phone Notes, and hallway conversations. This workspace
> gives her a single private place to collect the scattered signals she already
> juggles (her own visit observations, doctor feedback, lead-meeting takeaways,
> and aggregated low-confidence data), filter them herself, and turn them into
> the one or two things she wants every lead focused on this week. It is not a
> task manager. It is relief from carrying the whole map in her head.

---

## 1. Problem Statement

Ariyana (Director of RDAs) is the reference implementation of ProMoves' coaching
cascade, and she has **no operating surface**. She collects coaching signal from
four disconnected places and stores it in personal notes with no structure, no
corroboration view, and no path from "I noticed this" to "the leads worked on
it." Two documented system gaps converge on exactly this person:

- **G1 — the coaching cascade's fragmented surface.** The RDA line works *despite*
  the tooling, not because of it. (`docs/management-model.md` §4, G1.)
- **G2 — low-confidence signal has no intervention path.** The weekly loop
  generates low-confidence submissions with nowhere to go. Ariyana is the natural
  consumer of that signal, but today it never reaches her. (`docs/management-model.md` §4, G2.)

**Who experiences it, how often, at what cost:** Ariyana, continuously. Every
visit, every doctor conversation, every lead meeting adds another loose note.
The cost is cognitive load ("sticky-note cortisol"), signal loss (things get
forgotten before they reach a lead), and no institutional memory of how a
location changes over time. Strategically, until this person has a surface, the
cascade cannot be replicated to the DFI, OM, and doctor lines — this is the
prototype for the "signal-routing organ" the roadmap needs built once and
instantiated several ways (G2 + G7).

**Evidence** (source: John ↔ Ariyana working conversation, 2026-07-20, synthesized
in `docs/features/ariyana-coaching-workspace.md`):

- **User research (n=1, the design partner, direct quotes):**
  - "I have so many random notes." — the core pain, unprompted.
  - "It's time to build you a dedicated surface inside the app because you're
    having to pull together a bunch of disparate things and they all need to live
    in a place." (John, framing the need she confirmed.)
  - On the low-confidence firehose: individual low scores are "too granular… I
    don't want you to log in and see a laundry list of garbage." → the signal must
    be **aggregated**, never a per-person task list.
  - On why person-first fails: "nobody has a home office in Texas; they're all at
    different locations almost every day," and "everything in [Dr. Alex's] email
    is only at South Austin." → issues are **location-shaped**, not roster-shaped.
  - On the anti-goal: she wants organization and better presentation, not "a
    shittier version of existing software."
- **Behavioral data (live, `docs/management-model.md` §2):** 68 of 93 staff active
  across 12 locations; check-outs run ~25–30% below check-ins; eval acknowledgement
  is 31%. The reinforcement side of the loop leaks — and the reinforcement side is
  precisely what a coaching director acts on.
- **Competitive/internal signal:** the RDA line is single-rater and therefore
  calibrated and stable (G3); the lines without a working director-surface drift.
  Tooling the director is the cheapest way to protect what already works.

---

## 2. Goals & Success Metrics

The honest framing: this is an n=1 design-partner tool first. Several baselines
don't exist yet and must be instrumented at launch. Metrics below separate
"instrument at launch" from "target once we have a baseline."

| Goal | Metric | Baseline | Target | Window |
|------|--------|----------|--------|--------|
| Reduce her scattered-notes load ("sticky-note cortisol") | Self-reported: does the workspace hold what used to live in phone Notes / stickies? (weekly 1–5 check with Ariyana) | none (new) | ≥4/5 by week 4; she stops using external notes for RDA coaching | 6 weeks |
| Drive lead-meeting focus | % of lead meetings that open from a declared focus item in the workspace | 0% (no surface) | ≥80% of RDA lead meetings | 8 weeks |
| Make signal traceable to action | % of issues that reach a terminal state (`discussed`/`done`) vs. sitting `open` forever | none | ≥50% of issues moved past `open` within 30 days of creation | 60 days |
| Give the low-confidence signal a path (G2) | Aggregated low-confidence view is opened and at least one issue is created from it | 0 (no path exists) | Used at least 2×/month; ≥1 issue/quarter sourced from it | 90 days |
| Build institutional memory | # locations with ≥2 longitudinal report entries over time | 0 | ≥6 of 12 RDA locations | one quarter |

**North-star for this surface:** *Every RDA lead meeting is planned from the
workspace, and Ariyana no longer keeps RDA coaching notes anywhere else.*

---

## 3. Non-Goals

Stated explicitly to protect scope. Saying no here is the point.

- **Not an HR or discipline system.** Coaching and organizational health only.
  The Misha write-up prompted this feature, and the owner was explicit: "let's
  focus on the coaching and organizational-health side more than HR." HR
  record-keeping is out of scope. (This is a hard boundary, not a v1 deferral.)
- **Not a task manager.** Lightweight action items exist ("give Raul a heads-up"),
  but we are not building assignments, due dates, notifications-to-others, or a
  Kanban board. If it starts feeling like Asana, we've failed her.
- **Not a per-person low-confidence dashboard.** The low-confidence signal enters
  *only* as an aggregate menu item. A per-person "laundry list" is explicitly rejected.
- **Not multi-editor in MVP.** Ariyana is the sole author and filter. No inbox for
  doctors/leads to submit into it yet (fast-follow).
- **Not the lead-facing surface in MVP.** "This week's focus" on lead home and the
  "Ariyana wants to chat" button are specified below but deferred to fast-follow.
- **Not a redesign of the facilitator presentation surface.** We reuse its
  patterns; we do not touch `FacilitatePage` in MVP.

---

## 4. User Personas & Stories

**Primary Persona — Ariyana, Director of RDAs.** Roams between 12 locations,
coaches 6 lead RDAs, is the single calibrated evaluator for the RDA line. Lives in
her phone between visits. Wants relief and better presentation, not a second job.
She is the sole editor and filter of this workspace — "things should be able to
live here or not; she crafts this space to help her."

**Secondary Personas:** *Leads* (6 lead RDAs, already promoted to "lead") who will
eventually see "this week's focus" and a scheduling button. *Clinical directors*
(Dr. Alex, Dr. Casey) whose verbal feedback is a source today and who may later get
a submit-to-Ariyana inbox.

### The spine (3 steps) as user stories

**Story 1 — Review the collected issues.**
As Ariyana, I want to open one private place and see every coaching issue I've
collected — across all locations — so I stop reconstructing the map from memory.
**Acceptance Criteria:**
- [ ] Given issues tagged to zero, one, or many locations, when I open the
  workspace, then I see a **list view** with a location column that renders
  one location, multiple locations, or "Global / Other."
- [ ] Given I pick a location, when I switch to the **per-location view**, then I
  see only issues tagged to that location (plus any tagged Global).
- [ ] Given an issue has multiple sources, when I view it, then I see a
  corroboration signal ("2 leads + Dr. Alex + you saw it at McKinney").
- [ ] Given I want it out of the way, when I set status to `discussed`/`done`, then
  it drops out of the default open view but is never destroyed.

**Story 2 — Decide the 1–2 focus items for the lead meeting.**
As Ariyana, I want to promote what matters most this week into one or two focus
items written in my own plain words, so the leads all work the same thing.
**Acceptance Criteria:**
- [ ] Given the issues menu, when I declare a focus item, then I can write it in
  lay terms ("make sure notes start at height and weight") without picking a Pro Move.
- [ ] Given a lay-term draft, when I run **AI polish**, then I get a cleaned,
  lead-ready phrasing that I can accept or edit — I always keep final say.
- [ ] Given a focus item, when I've declared it, then it is scoped to 1–2 per
  upcoming lead meeting (the surface resists a third — anti-firehose).

**Story 3 — Build the lead meeting.**
As Ariyana, I want to assemble the focus items plus any framing into the thing I'll
present, so walking into the meeting is one click, not a scramble.
**Acceptance Criteria:**
- [ ] Given declared focus items, when I "build" the meeting, then I get an
  assembled view (focus items + optional framing note) ready to present or hand off.
- [ ] Given I built it, when the meeting happens, then I can mark the sourcing
  issues `discussed` from that context.

**Supporting stories (still MVP):**
- As Ariyana, I want to **paste or upload a transcript** (a lead-meeting AI-notetaker
  transcript or a visit recording) and have the app **extract candidate issues** that
  I then pick from — "search this for issues, and then you choose the ones that go in."
- As Ariyana, I want a **longitudinal per-location report** I can brain-dump into
  (voice or paste) and edit — "last quarter here's what I saw, here's the stuff… a
  record that is going to be gold."
- As Ariyana, I want **private per-staff notes** only I can see (e.g. "Dr. Britta
  removes caries if the assistant pre-tricks") — never staff-visible.

---

## 5. Solution Overview

A private, location-organized workspace that sits beside the facilitator surface,
scoped to Ariyana. Four surfaces, one mental model ("a menu for Ariyana… like a
crazy-person map with red twine" — made legible).

**A. Issues — the collection layer (two views over one object).**
An issue is authored **once** and tagged to **0..N locations** (or marked
Global/Other). This directly resolves the roaming-staff reality: we do not force
per-location re-entry.
- **List view:** all issues, columns = title/framing, **location** (chip that holds
  one, many, or "Global / Other"), source + corroboration count, optional lead,
  status, optional action. Filter/sort, don't fragment.
- **Per-location view:** the same issues filtered to a location (the "state of
  McKinney" lens), including Global issues that apply everywhere.
- Each issue is framed as an **opportunity to grow**, not a gotcha.

**B. Sources & ingest.**
- **Manual add** (her observation, a doctor's verbal note, a lead takeaway).
- **Aggregated low-confidence signal** as a **menu item** ("lots of low scores on
  case acceptance / this Pro Move"), never a per-person list. This is the G2 path.
- **Transcript ingest** reusing the existing eval AI pipeline: `transcribe-audio`
  (if audio) → `format-transcript` → `extract-insights` returns candidate issues →
  Ariyana selects which become issues. This mirrors, almost exactly, the working
  flow in `src/components/clinical/MeetingOutcomeCapture.tsx`.

**C. Focus declaration — the lead-facing-intent layer (modeled on the builder).**
Reuse the **planner/sequencer two-panel interaction** (`PlannerWorkspace`:
`WeekBuilderPanel` on the left with slots, source `LibraryPanel` on the right). Here
the left panel is **"this week's lead focus"** with **1–2 slots**; the right panel is
the **issues menu** she pulls from (or she types a fresh lay-term item). Each focus
item runs through an **AI polish** step (reuse `format-reflection`, or a small
purpose-built `format-focus` prompt) before it's lead-ready. She always confirms.

**D. Build the lead meeting.**
Assemble the 1–2 polished focus items plus optional framing into a present/hand-off
artifact. Where this connects to `FacilitatePage` is an open question (§6) — MVP can
ship a standalone assembled view and integrate later.

**E. Longitudinal location report & private staff notes.**
Per-location report entries over time (voice/paste brain-dump → structured, editable
via `format-reflection`). Private per-staff notes, author-only, never staff-visible.

### Key Design Decisions

- **Location is the organizing unit, person is a private tag.** We chose
  location-first over person-first because staff roam and issues cluster by site.
  Trade-off: an issue about a specific roaming person needs a private person tag *and*
  a location tag to appear in the right lens; we accept that over forcing a roster model.
- **Views, not multi-entry.** One authored issue, N location tags, resolved through
  a list view and a per-location view. Trade-off: slightly more complex query/RLS than
  a flat "one issue = one location" table; worth it to avoid duplicate data entry.
- **Ariyana is the sole filter (MVP).** We chose a single-author model over an open
  intake to protect against the firehose she explicitly fears. Trade-off: doctors/leads
  can't self-submit yet; deferred to fast-follow with her still as filter.
- **Aggregate-only low-confidence.** We chose a menu-item aggregate over a per-person
  queue because the owner rejected the "laundry list of garbage." Trade-off: less
  precision; we lose the ability to route to a *specific* person automatically — which
  is fine, because routing to a person is not the job here.
- **Focus items are lay-term first, Pro Move-linked never (for now).** She writes
  intent in plain words; AI polishes phrasing, not taxonomy. Trade-off: focus items
  don't yet plug into the scoreable Pro Move loop (see open question on lead self-grading).
- **Reuse over rebuild.** Ingest reuses the eval AI pipeline; focus declaration reuses
  the planner's two-panel model; report/polish reuses `format-reflection`. Trade-off:
  we inherit those functions' prompts and quirks; acceptable and faster.

Design mocks: none yet — to be produced against the planner and facilitator surfaces.

---

## 6. Technical Considerations

### Proposed data model — **PROPOSAL ONLY, no DDL, nothing applied**

Consistent with repo conventions: `uuid` primary keys, **RLS on every table**,
org scoping via the `staff → locations → practice_groups → organizations` chain and
`current_user_org_id()`, author scoping so rows are visible only to their author
(MVP = Ariyana). All tables `*_coaching_*`-prefixed to signal the coaching/org-health
domain (explicitly not HR). This is a planning artifact; the concrete migration is a
separate, later task written idempotently and applied per the CLAUDE.md migration rules.

| Proposed table | Purpose | Key columns (sketch) |
|---|---|---|
| `coaching_issues` | The issue object (authored once) | `id uuid`, `org_id`, `author_staff_id`, `title`, `body`, `framing` (default `grow`), `status` (`open`/`discussed`/`done`), `is_global bool`, `lead_staff_id?` (optional), `private_person_staff_id?` (optional, never staff-visible), `created_at`, `updated_at` |
| `coaching_issue_locations` | Issue ↔ location tags (0..N) | `id uuid`, `issue_id → coaching_issues`, `location_id → locations`. Absence + `is_global=true` ⇒ "Global / Other" |
| `coaching_issue_sources` | Corroboration; each source is a row (count = weight) | `id uuid`, `issue_id`, `source_type` (`self_visit`/`doctor`/`lead`/`low_confidence`), `source_staff_id?` (the doctor/lead), `pro_move_id?` (for low-confidence), `note?`, `created_at` |
| `coaching_issue_actions` | Lightweight action items (NOT a task manager) | `id uuid`, `issue_id`, `text`, `done bool`, `created_at` |
| `coaching_location_reports` | Longitudinal state-of-location entries over time | `id uuid`, `org_id`, `location_id`, `author_staff_id`, `period_label`, `body_md`, `created_at` |
| `coaching_staff_notes` | Private per-staff notes, author-only | `id uuid`, `org_id`, `author_staff_id`, `subject_staff_id`, `body`, `created_at`. RLS: visible only to author, **never** the subject |
| `lead_focus_items` | Declared 1–2 focus items per lead meeting | `id uuid`, `org_id`, `author_staff_id`, `meeting_date` (or week key), `raw_text` (lay), `polished_text` (AI), `status`, `display_order` (1–2), `location_id?` (scope), `pro_move_id?` (**open question**, nullable) |
| `lead_focus_item_issues` | Links a focus item back to sourcing issues (the "build" step) | `id uuid`, `focus_item_id`, `issue_id` |
| `coaching_ingest_sessions` *(optional MVP)* | Holds a pasted/uploaded transcript + AI-extracted candidates pending selection | `id uuid`, `org_id`, `author_staff_id`, `raw_transcript`, `formatted_transcript`, `candidates jsonb`, `created_at`. Could be ephemeral/client-side instead — decide at build |

Notes: an issue's "location column" is computed from `coaching_issue_locations` +
`is_global`. Corroboration count is `count(coaching_issue_sources)`. Aggregated
low-confidence is **read** from existing `weekly_scores`/confidence data at query
time (an aggregate view/RPC), not stored per-person here.

### Reuse map (build on, don't rebuild)

| Need | Reuse |
|---|---|
| Transcript ingest → candidate issues | `supabase/functions/transcribe-audio` → `format-transcript` → `extract-insights`; pattern in `src/components/clinical/MeetingOutcomeCapture.tsx` (transcript → insights → selectable list) |
| AI polish of lay-term focus + report brain-dumps | `supabase/functions/format-reflection` (or a small `format-focus` variant) |
| Voice capture for reports | `src/components/coach/VoiceCaptureButton.tsx` + `audioChunking.ts` |
| Focus-declaration two-panel interaction | `src/components/planner/PlannerWorkspace.tsx` (`WeekBuilderPanel` slots ← `LibraryPanel` source) |
| Present/hand-off styling & meeting-flow patterns | `src/pages/facilitate/FacilitatePage.tsx` (adjacent surface; do not modify in MVP) |
| Role/label resolution, org scoping | `useUserRole`, `useRoleDisplayNames`, `current_user_org_id()` |

### Dependencies (owner-owned, from the meeting)

| Dependency | For | Owner | Risk |
|---|---|---|---|
| Ariyana creates a Google appointment booking link (Lead 1:1) | Fast-follow "Ariyana wants to chat" button | Ariyana | Low (fast-follow only) |
| Promote all current leads to "lead" in admin | Lead-facing pieces know who's a lead | John | Low |
| Give Ariyana access to her meeting transcripts (in Motion) | Transcript ingest has real input | John | Med — no transcripts, no ingest test |
| Migration applied via SQL Editor / Lovable (not `db push`) | All persistence | John | Low but process-specific (see CLAUDE.md) |

### Known Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| It drifts into a task manager and she abandons it | Med | High | Ruthless non-goals; lightweight actions only; weekly check with her |
| Private-notes leakage (staff sees a note about them) | Low | **Very High** | RLS visible-to-author-only; explicit test; never expose `private_person_staff_id`/`coaching_staff_notes` in any staff-facing query |
| Low-confidence aggregate accidentally re-identifies a person | Med | High | Aggregate-only view with a minimum-N threshold before display (§ open question) |
| AI extract/polish produces off-tone or wrong candidates | Med | Med | Human-in-the-loop always; she selects/edits; nothing auto-saves |
| Two permission systems (`is_*` flags vs `user_capabilities`) | Med | Med | Gate MVP simply (Ariyana / super-admin), avoid deep permission work; follow `useUserRole` |

### Open Questions (resolve before/at build)

- [ ] **How does "build the lead meeting" connect to `FacilitatePage`?** Standalone
  assembled view for MVP, or a new step injected into the facilitator flow? — Owner: John.
- [ ] **Do focus items ever link to Pro Moves?** They're lay-term today, but the
  fast-follow lead self-grading ("grade themselves on it for the week") implies a
  scoreable unit. Keep `pro_move_id` nullable and decide when we spec the lead-facing half. — Owner: John.
- [ ] **Low-confidence aggregation grain + privacy floor.** Per location? per Pro Move?
  per domain? What minimum-N before a signal is shown so it can't re-identify one person? — Owner: John.
- [ ] **Roaming person + location interplay.** When an issue is about a specific roaming
  person, does it surface in a location lens via the private person tag, the location tag, or both? — Owner: John/Ariyana.
- [ ] **Access model.** Ariyana-only hardcode for MVP, or a capability that generalizes to
  future training directors? (Cheaper now to gate to her; note the generalization.) — Owner: John.
- [ ] **Transcript store.** Persist ingest sessions (`coaching_ingest_sessions`) or keep
  ephemeral/client-side? — Owner: John/eng.

---

## 7. Launch Plan

Single design-partner rollout — Ariyana is the guinea pig. No cohort ramp; the "beta"
is her using it for real RDA lead meetings.

| Phase | Audience | Success Gate |
|-------|----------|--------------|
| Internal build | John + Ariyana | Issues list + per-location view + manual add + focus declaration with AI polish working end-to-end |
| Design-partner use | Ariyana only | She plans ≥1 real lead meeting from it; transcript ingest tried on a real transcript |
| Fast-follow spec | — | Lead-facing "this week's focus" + scheduling button specced once booking link + lead promotions land |

**Rollback:** feature-flag / route-gate the whole workspace to Ariyana. If it's not
earning its place at week 4 (self-report < 3/5, still living in phone Notes), pause
and re-interview rather than expand.

### Roadmap slices (MVP / Fast-follow / Later)

**MVP (Ariyana as guinea pig):**
- Private, location-organized issues workspace: list view (multi-location + Global/Other
  column) and per-location view.
- Manual issue add; corroboration/sources; status open/discussed/done; lightweight actions.
- Transcript ingest with AI extract-and-select.
- Aggregated low-confidence signal as a menu item (aggregate only).
- Focus declaration (1–2 items, lay-term, AI polish) modeled on the builder; "build the meeting" assembled view.
- Longitudinal per-location report; private per-staff notes.

**Fast-follow:**
- Lead-facing "this week's focus" on the lead's ProMoves home (recap for anyone who missed the meeting).
- "Ariyana wants to chat" button → her booking link + email notification.
- Inbox so Dr. Alex/Casey can *send* issues to her (she stays the filter).

**Later:**
- Org-wide rollout to other training directors (generalize the access model).
- Cross-role signal synthesis (doctor → RDA-director routing, G7).
- Focus-item ↔ Pro Move linkage + lead self-grading loop, if we decide to connect them.

---

## 8. Appendix

- `docs/features/ariyana-coaching-workspace.md` — design synthesis of the source conversation (primary research).
- `docs/management-model.md` — G1/G2 (and G7) strategic context; the signal-routing organ.
- `docs/features/facilitator-presentation.md` + `src/pages/facilitate/FacilitatePage.tsx` — adjacent facilitation surface.
- `src/pages/AdminBuilder.tsx` + `src/components/planner/*` — builder/sequencer interaction model for focus declaration.
- `src/components/clinical/MeetingOutcomeCapture.tsx` — the transcript → insights → selectable-list pattern to reuse.
- Edge functions: `transcribe-audio`, `format-transcript`, `extract-insights`, `format-reflection`.
- `docs/data-model.md`, `docs/glossary.md` — schema conventions and domain terms.
</content>
</invoke>

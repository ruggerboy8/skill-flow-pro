# ASK-5: Mirror the Pro Moves framework into the Ask corpus

**Status: APPROVED by John 2026-08-21 (evening, same day as the draft).
Ready to ticket for a build lane. Decisions: (1) Option A, one doc per
active pro move. (2) Mirror rows land as `canon` directly. (3) Refresh
via the local watermark script; no prod infra for now. One open question
carried forward on citation links, see the source_url section.
Nothing is built yet. No DB was touched; research was read-only SQL.**

**Correction (2026-08-26): scope by practice type, not just ownership.**
The first live run mirrored every active platform pro move (owner_org_id
null) and ingested 125 `general_uk` docs (Avenue expansion framework) into
Alcan's corpus alongside the 214 `pediatric_us` ones. `owner_org_id is null`
is necessary but NOT sufficient: the platform `pro_moves` table mixes
practice-type frameworks. The mirror now also requires
`practice_types @> ['pediatric_us']` (see `ALCAN_PRACTICE_TYPE` in
`mirror_pro_moves.py`), and the 125 UK docs were purged from prod. For a
second org, map its org to its practice type there.**

## The five-minute version

The Ask bot answers from `corpus_documents`. Right now that corpus is
Basecamp docs only, so the bot can quote a 2023 memo about nitrous but
knows nothing about the framework the whole product is built on: the 339
active pro moves and their scripts, doctor guidance, and coaching prose.
This spec proposes mirroring that framework content into the corpus as
generated rows that refresh when the framework changes.

**Decision needed from you:**

1. Granularity: one corpus doc per pro move (recommended), per
   competency, or both.
2. Do mirror rows land as `canon` directly (recommended) or go through
   your review queue like Basecamp rows?
3. Green-light the refresh approach (a local re-render script gated by a
   `framework_history` watermark, same trust model as the ingest scripts).

Everything else below is supporting detail. If you approve options A,
canon, and refresh option 2, this is ready to ticket for a build lane.

## What I verified in prod (read-only, 2026-08-21 overnight)

- **pro_moves:** 347 rows, 339 active, all platform-owned
  (`owner_org_id` null). Roles: Dental Assistant 117, Front Desk 115,
  Doctor 68, Office Manager 46, Lead DA 1. Spread across 107 active
  competencies (126 exist), each competency tied to one role and one
  domain.
- **The prose lives in three places, not one.** On `pro_moves` itself:
  `action_statement` (the "I always..." line), `description` (329 rows,
  avg 166 chars), `intervention_text` (235 rows, avg 167 chars, a
  coaching nudge in second person). The `steps` column is empty on every
  single row; it is vestigial, ignore it.
- **The doctor-track prose is in `pro_move_resources`, not on the pro
  move.** Resource types with markdown bodies: `doctor_why` (68),
  `doctor_good_looks_like` (68), `doctor_gut_check` (66), `doctor_script`
  (64), plus `script` (54, the verbatim staff scripts). That is 320 rows
  with bodies totaling 137,677 chars (the plan's "309 / ~138k" was close;
  the count has grown). Another 61 resources are body-less: `audio` (55
  active + 4 archived, URL only), one `link`, one `video`. 123 distinct
  pro moves have at least one resource; zero resources are orphaned.
- **Total mirrorable prose:** ~137k chars on pro_moves + ~135k chars of
  active resource bodies, so roughly 272k chars, about 68k tokens if it
  were all packed at once. (Sequencing consequence below.)
- **framework_history works for us:** append-only, 921 rows, one row per
  change with `table_name`, `record_pk`, `version_no`, full `old_row` /
  `new_row` jsonb, `changed_fields`, `changed_at`, `change_reason`. It
  covers both `pro_moves` and `pro_move_resources`. Cosmetic updates
  (curriculum priority columns, `updated_at`) produce no rows, which is
  exactly the noise filter a sync wants. `max(id)` is a perfect cheap
  watermark for "did anything change since last run".
- **corpus_documents is ready as-is:** `source_kind` check already allows
  `'authored'`, and idempotency is a unique constraint on
  `(org_id, source_item_id)` with `source_item_id` as free text. No shape
  change is needed for any option below.
- **Deep links:** the app has `/my-role/area/:competencyId` (Craft Atlas
  competency page, lists that competency's pro moves, detail opens on
  click with no URL param) and `/clinical/pro-moves` (doctor library).
  There is no per-pro-move URL today.

## John's open question: should this differ from Basecamp shape at all?

Recommendation: **no new columns, no new table, no shape change.** Mirror
rows are ordinary `corpus_documents` rows and the frozen response
contract means citations just work. The only differences are data
conventions:

| Field | Basecamp rows | Mirror rows |
|---|---|---|
| source_kind | `basecamp` | `authored` |
| source_item_id | Basecamp item id | `promove:<action_id>` |
| source_url | Basecamp deep link | in-app deep link (below) |
| status | your review flow | `canon` on insert (decision 2) |
| posted_at | original post date | pro move `updated_at` |
| stale_risk | per ledger | `false` (versioning handles staleness) |
| body | extracted text | rendered from framework fields |

One honest wrinkle: the ASK-1 migration comment says `source_item_id` is
"NULL for authored docs". Mirror rows are machine-authored, so giving
them a prefixed key is a deliberate extension of that convention, not a
violation of any constraint. If you would rather keep provenance crisp,
the alternative is a one-line check-constraint widening to add
`source_kind = 'app_mirror'`. Cleaner label, but it is DDL on
`corpus_documents`, which your prod-touch policy currently forbids
changing. The prefix convention gets the same effect with zero DDL, so
that is the recommendation.

## Decision 1: granularity

### Option A: one doc per active pro move (recommended)

339 docs. Each renders like this:

```
Title:  Front Desk pro move: I always communicate individually with all
        patients in the waiting area when we are running more than 10
        minutes behind schedule.

Body:
  Role: Front Desk | Domain: Clinical | Competency: Daily Schedule
  Adaptability

  ## Why it matters
  (description)

  ## Coaching nudge
  (intervention_text)

  ## Script: <resource title>
  (script content_md)

  ## Doctor guidance          <- doctor moves only
  ### Why / What good looks like / Gut check / Script
  (the four doctor_* resource bodies)

  Also on this pro move in the app: Audio: "<title>".
```

The 320 resource bodies attach **inline as sections of their parent pro
move's doc**, not as separate corpus rows. Body-less resources (audio,
video, link) get a one-line mention so the bot can say "there is an audio
version, it is on the pro move page" and the citation link takes you
there.

Why A wins: docs land at 800 to 2,500 chars, which is exactly one chunk
for the ASK-2 chunker, so search hits are precise and a citation points
at the specific pro move, not a 15-move competency wall. Refresh is
surgical: `framework_history.record_pk` keys by action id (resources
resolve to their parent in one join), so one edited script re-renders one
doc. And when someone asks "what's the script for aftercare after a
filling", the bot cites the exact move.

### Option B: one doc per competency

107 docs, each holding the competency's tagline and description plus all
its pro moves as sections. Fewer rows and the citation link
(`/my-role/area/:competencyId`) works perfectly today. But docs run 2 to
15 pro moves long, so chunking splits them anyway, citations get vaguer,
and any edit re-renders the whole competency. Only worth it if you want
the corpus to read like the atlas rather than like the framework.

### Option C: A plus thin competency overview docs

Option A, plus 107 small docs carrying each competency's tagline,
friendly description, and interview prompt. Helps questions like "what
does Daily Schedule Adaptability actually mean". Cheap to add later; I
would ship A first and add these only if testing shows the bot fumbles
competency-level questions.

## source_url: what a citation should open

Recommendation:
`/my-role/area/<competencyId>?move=<action_id>`

The competency page exists today, so the link is never dead. The `?move=`
param is ignored by the current page (harmless), and a small future
frontend change can read it to auto-open that pro move's detail sheet.
That keeps this spec zero-frontend while reserving the exact deep link.

Caveat to be honest about: the Craft Atlas is the viewer's own-role
surface. A super-admin clicking a Dental Assistant citation may land on a
page scoped to their own role. Doctor moves could alternatively link to
`/clinical/pro-moves`. Fine for the current three-user test group; worth
a proper "any-role pro move view" ticket before access widens, and the
`?move=` convention will carry over to it unchanged.

**John's direction on this (2026-08-21):** the intended experience is
that a citation opens the pro move inside the viewer's own role atlas,
and most of the time that should just work, because a well-tuned search
should answer a DFI's question with DFI pro moves. When an answer does
cite another role's move, the citation should still appear but not be
clickable: a link must never lead somewhere the viewer is not allowed to
go. **Open question, not yet decided:** exactly how the frontend knows a
cited move is outside the viewer's role (and whether some cross-role
visibility is actually desirable, e.g. a lead reading a doctor script).
Resolve during the ASK-5 build or the "any-role pro move view" ticket,
whichever comes first. The mirror itself is unaffected: `source_url`
stays the reserved deep link either way.

## Decision 2: status and ownership

Recommendation: mirror rows insert as **`canon`**, skipping your review
queue. The framework is the most curated content in the product already;
routing 339 machine-rendered rows through the same review flow as
unread Basecamp memos would just bury your ledger work. `reviewed_by`
stays null and `created_by` null (script-written), which also gives any
future cleanup an easy handle.

Expert area: map by role in the mirror script config (Doctor moves to the
clinical area, Front Desk and Office Manager to operations, DA to RDA
practice, adjustable as a small dict). Ownership stays data, per ASK-1.

## Decision 3: refresh strategy

Pro moves change (Dr. Alex's batch landed 61 resource inserts on
2026-08-12) and `framework_history` already records every meaningful
change. Three options:

1. **Snapshot and forget.** Rejected: the corpus would silently drift
   from the live framework, which is the one failure mode worse than no
   mirror at all.
2. **Local watermark script (recommended).** `mirror_pro_moves.py` in
   `scripts/basecamp-corpus/`, same service-role .env and trust model as
   `ingest_corpus.py` and `sync_decisions.py`. Each run: check
   `max(framework_history.id)` against a stored watermark; if unchanged,
   exit in one query. If changed, re-render all 339 docs (this is a
   339-row table, a full render takes seconds), compare a content hash
   per doc, and upsert only the changed ones on
   `(org_id, source_item_id)`. Then run `embed_corpus.py` so ASK-2
   re-embeds them. Full-render-plus-hash instead of replaying history
   rows keeps the script self-healing: it can never miss an event,
   because it does not consume events. Retired moves (`active = false`,
   the only allowed removal path since deletes are trigger-blocked) flip
   their mirror row to `rejected`, keeping the audit trail and leaving
   the answer set, same semantics as a Basecamp reject. Run it after
   framework editing sessions, or chained onto the same habit as
   "sync my decisions".
3. **In-prod trigger or queue.** The right end state once the ASK-3
   corpus manager makes in-app edits routine, and it should ride the same
   graduation as ASK-2's move to Supabase automatic embeddings. Standing
   up prod infra tonight for a table that changes a few times a month is
   premature.

## Sequencing (important, one paragraph)

Do not run this mirror before the ASK-2 cutover. Under the current
long-context spike, 339 new `canon` docs (~68k tokens) would jump the
status-priority queue and crowd the 150k packing window, degrading
Basecamp answers. After cutover, mirror rows are just more searchable
rows and the sizing is irrelevant. The morning checklist already has the
cutover ahead of this spec's review, so the natural order is: cutover,
then build ASK-5.

## Out of scope

- Any frontend change (the `?move=` param is reserved, not built).
- Org-owned pro moves (there are none yet; the script filters
  `owner_org_id is null` and revisits when multi-tenant framework
  content exists).
- Competency overview docs (Option C, add on evidence).
- Non-Alcan orgs, wider access, and anything touching the ledger flow.

## Acceptance sketch (for the eventual build ticket)

1. Run mirror: 339 `canon` docs exist with `source_item_id` like
   `promove:%`; re-run with no framework changes writes zero rows.
2. Edit one script resource in SQL (attended), run mirror: exactly one
   doc updates, and after embed refresh the bot's answer reflects it.
3. Retire one pro move (attended, on a test row): its doc flips to
   `rejected` and leaves the answer set.
4. Ask "what is the front desk script for running behind schedule": the
   answer quotes the script and the citation links to the right
   competency page with the right `?move=` id.
5. Basecamp rows are untouched: their count and statuses are identical
   before and after a mirror run.

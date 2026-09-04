# Replacing Basecamp: theory of the case (draft v0.1)

**Status:** discussion draft, built from evidence in the 2026-08-21 Basecamp
exports (all 14 active spaces, 3,983 items, 4.5 years of history).
**Author:** Claude, for John. Not yet reviewed.

## Why this doc

Basecamp is Alcan's de facto intranet: announcements, reference docs, training
video library, onboarding checklists, compliance trackers, supply lists,
social-media planning, photo archive. Some of that is communication that
Pro Moves can do better because it knows who you are, what role you have, and
where you work. Some of it is generic project management that we should not
attempt to rebuild. This doc sorts the observed usage into replace / don't
replace, with the evidence for each call.

## What the exports actually show

**Space structure.** One company-wide space, five role spaces (doctors, RDAs,
practice managers, DFI, regional managers), seven location/brand spaces, one
dormant school space. Role spaces mirror Pro Moves's role concept almost 1:1;
location spaces mirror `locations`. Basecamp is being used as a poor man's
role-and-location-scoped feed, which is exactly the scoping Pro Moves gets for
free from its data model.

**Feature usage, measured.**

| Basecamp feature | Usage | What it's really used for |
|---|---|---|
| Message boards | 542 messages / 4.5 yrs, growing (208 in 2025) | Top-down announcements. Tim + Dr. Alex wrote 49% of all messages (37 authors total). Includes 45 Vitals newsletter issues. |
| Comments | 1,420 total; ~45% of messages get at least one | Real two-way engagement: questions, confirmations, coordination. Not a dead broadcast board. |
| Docs & files | Largest area by volume; ~14GB of the ~15GB total is media | Three distinct things mixed together: (a) reference docs/protocols (~270 PDFs + 124 Basecamp docs), (b) a training video library (~240 videos, 8GB), (c) an event/headshot photo archive. |
| To-do lists | 1,112 stamped task pages | Four distinct jobs: per-hire onboarding checklist stamping, compliance expiration tracking (emergency meds/equipment at EVERY location, AED testing, CE, licenses), supply ordering (Costco/Amazon/vendor lists), and social content pipelines (monthly "trending reels" lists). |
| Schedules | ~170 entries | Call schedules and community/marketing events (fall festivals, school presentations). |
| Campfire chat | 7-30KB per space, essentially dead | They do not chat in Basecamp. Real-time chat happens elsewhere. |
| Check-ins, card tables, email forwards | Zero real usage | Empty features. |

## Theory of the case

The load-bearing insight: **Basecamp is not one product to replace, it's five
products in a trench coat, and only two of them are ours.**

### Replace in Pro Moves (communication + knowledge, our home turf)

1. **Announcements + Vitals.** The core comms use is one-to-many posts scoped
   to company/role/location, with comments. Pro Moves can beat Basecamp here:
   audience targeting from the real org model instead of space membership,
   read tracking, and push delivery (the PWA push initiative is this exact
   pipe). The Vitals newsletter gets a composer and an archive. Comments must
   ship with this — the 45% comment rate says a post surface without replies
   would lose something the org actually uses.
2. **Reference knowledge.** Protocols, policies, how-tos, checklist templates.
   This migration is already underway — it's the Ask corpus. The corpus
   manager is strictly better than docs-and-files: owned, versioned, cited,
   searchable, and contradiction-checked.
3. **Training video library.** ~240 videos used as training reference. Belongs
   with Pro Move resources / the corpus, not in a filing cabinet. (Hosting is
   a real cost/infra question to solve before promising this.)
4. **Recognition and culture posts.** Shoutouts, milestones, birthday posts are
   a meaningful share of message traffic. MOB-5 (recognition card) is already
   pointed at this. This is culture infrastructure, squarely in mission.
5. **Maybe, later: per-hire onboarding checklists.** The heaviest to-do use is
   stamping a role-specific checklist per new hire. It rhymes with Pro Moves's
   structured-accountability DNA and touches training. But it's HR ops, not
   comms — phase it separately if at all.

### Do not rebuild (fit-for-purpose tools exist; low ceiling for us)

- **Real-time chat.** Campfire is dead in the data. Nobody is asking us to be
  Slack, and building chat is a tar pit.
- **Generic to-dos / project management.** Supply ordering, vendor lists,
  content requests. Commodity software, zero coaching leverage.
- **Compliance/asset tracking.** Emergency med expirations, AED testing, CE
  tracking. This is a real, universal need (every location built one by hand!)
  but it's checklist/EHS software with reminder logic and audit trails. Worth
  acknowledging as a possible future module; wrong to smuggle into a comms
  build.
- **Social media content pipeline.** Trending-reels calendars are marketing
  ops. Dedicated tools do this.
- **Photo/media archive.** ~10GB of event photos and headshots is a storage
  product (Google Drive/Photos territory), not a comms feature.
- **Community event calendar.** Google Calendar territory.

### Consequence for scope

The Pro Moves comms build reduces to three surfaces sharing one backbone:
**announcements with comments and push**, **the knowledge corpus** (in
flight), and **recognition** (in flight). That's a focused build. The long
tail (ordering, marketing, compliance) either stays in Basecamp or moves to
fit-for-purpose tools on its own timeline — a "shrink Basecamp" strategy, not
a "kill Basecamp day one" strategy.

## Caveats and open questions

- **Time skew.** The record spans 4.5 years. Old threads may document process
  disagreements that have since been resolved; treat pre-2025 process content
  as historical evidence, not current state. (The corpus ledger carries a
  stale-risk flag for this reason.)
- **What we can't see.** Chat happens outside Basecamp (likely texting). The
  export says nothing about that channel or its volume, and it may be the
  real daily-communication backbone. Worth asking the team before concluding
  "no chat needed."
- **Comment migration.** If announcements move, does the historical archive
  come along, or does Basecamp remain a read-only archive? (Recommend the
  latter; the corpus keeps the durable knowledge.)
- **Adoption physics.** Basecamp's job was done by two founders posting
  consistently. Any replacement lives or dies on whether Tim and Alex post
  there instead. The Vitals composer should be the first thing they touch.

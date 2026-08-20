# DASH-1: Command Center color direction and at-a-glance redesign

Status: approved by John 2026-08-20 (both phases); 1a built and QA-passed
Lane: medium
Motion ticket: DASH-1 on the MyProMoves Dev Board
Date: 2026-08-20

## What and why

The Command Center (route `/dashboard`, component `RegionalDashboard`) shows
lots of red even when participation numbers are good, so the page reads like
everything is on fire and red stops meaning anything. The root causes are
presentation, not data: the domain confidence heatmap paints normal
learning-phase scores (averages under 2.5 on the 1 to 4 scale) in red, location
cards go fully red on any sub-50% rate, and raw late counts are colored red
regardless of proportion (3 late out of 120 looks like 30 of 40). This spec
redefines what red means on the page, moves confidence scores onto a
non-alarm scale, and makes the layout serve its one real audience, the
regional or org admin, in their two moments: mid-week nudging and week
wrap-up review.

## Locked decisions

- Red is reserved for missed-deadline participation problems only. Confidence
  and skill scores never render red.
- One audience: the regional/org admin. Two moments: mid-week (who needs a
  nudge before the deadline) and wrap-up (who missed, where to coach).
- Restructuring is allowed: same data sources, same route, no DB changes,
  desktop-first, all existing information stays reachable.
- All colors come from design tokens, never hardcoded Tailwind palette
  classes. This is already a repo rule the heatmap and banner violate today.

## Design direction (from UX research pass, 2026-08-20)

### Color tiers, page-wide

| Tier | Meaning | Tokens |
|---|---|---|
| Red (alarm) | Location or org participation below the red threshold after a deadline. The only red on the page. | `--status-missing` / `-bg` |
| Amber (watch) | Deadline passed with a minor shortfall, or a deadline within hours with pending submissions | `--status-late` / `-bg` |
| Neutral (info) | Everything pre-deadline: pending counts, progress fractions, deadline chips; excused states | `--status-pending`, `--status-excused`, muted foreground |
| Good | Calm, not green: default surfaces, at most one small `--status-complete` accent (check icon or thin "On track" chip) | `--status-complete` |

Confidence averages use the `--score-1` through `--score-4` ramp (text plus
`-bg`), which reads as a learning gradient, not a traffic light.

### Moment-aware layout

The page already computes per-location deadline gates, so it can tell which
moment it is: mid-week (any window still open) vs wrap-up (all locations past
their performance deadline).

- **Mid-week order**: "Needs a nudge" strip (locations with pending
  submissions, ordered by soonest deadline, amber at most), then the location
  grid (sorted by deadline proximity and pending count, showing progress
  fractions), then the heatmap demoted to the bottom (it is 6-week lookback
  data, irrelevant to nudging).
- **Wrap-up order**: "Missed this week" strip (only locations below threshold
  after deadlines; this is where the page's only red lives; if nothing missed,
  one quiet "All locations submitted" line), then the heatmap promoted as the
  coaching lens, then the grid as the calm archival record sorted by final
  rate ascending.

### Per-widget changes

- **SignalsBanner**: keep as the spine. Retitle per moment ("Needs a nudge" /
  "Missed this week"). Mid-week entries amber at most; wrap-up misses get the
  page's only red. Empty state becomes a plain muted line with a small
  complete-token icon, not a green box. Migrate its hardcoded emerald/amber
  classes to tokens.
- **Summary stat cards**: merge three cards into one participation row.
  "Total Staff" moves to a plain figure in the header next to the location
  badge. The merged card always shows proportion, never a bare count:
  "112 of 120 confidence in (93%)" with a small inline meter. Color the rate,
  not the number, and only after a deadline. "3 late" becomes a muted
  late-token chip beside the rate.
- **DomainConfidenceHeatmap**: keep the widget, replace the color logic.
  Cells use the score-1 to score-4 ramp keyed to the rounded average. Mark
  any cell trailing its row's group average by 0.5 or more with a subtle ring
  or dot (the cross-location coaching signal). Replace the caption with
  "1 to 4 self-rated confidence, higher is more confident" (the current
  "under 2.5 needs attention" caption teaches the wrong reading). Demote
  mid-week, promote at wrap-up.
- **LocationHealthCard grid**: card-level red (border, wash, big number) only
  past deadline and below the red threshold. Watch band gets late-token
  accents. Above that, plain default cards; the current primary-tinted
  success treatment is replaced by a small "Submitted"/"On track" chip.
  "N late" badges become late-token chips, not destructive, so each card
  carries at most one alarm (the card itself). Pending chips stay neutral.

### Thresholds

- Post-deadline location rates: red below 60%, amber 60 to 84%, neutral 85%
  and up (replaces 50/80).
- Small-team guard: red also requires at least 3 missed people, or a team of
  5 or fewer with 0 to 1 submissions, so a 3-person location with one absence
  does not go red.
- A single late person out of many never triggers more than a neutral-amber
  chip. Names live one click away on the location detail page.
- Align the banner's signal threshold with these bands (fires below 85%,
  red-flavored below 60%) so banner and cards never disagree.

### Anti-goals

- No good/bad threshold coloring on confidence scores; the score ramp plus
  the trailing-cell marker is the ceiling.
- No new alarm states or severity levels; one red, no "critical vs urgent."
- No coloring of raw counts anywhere; only rates and proportions earn state
  color.
- No red anywhere before that location's deadline has passed, including the
  banner.
- No green celebration washes; success is quiet.
- Do not hide straggler data; demote it, never remove it (the nudge list
  depends on it).

## Ticket breakdown (order matters)

1. **DASH-1a (recolor, current layout)**: token migration and new color
   logic in SignalsBanner, DomainConfidenceHeatmap (score ramp, trailing
   marker, caption), LocationHealthCard (thresholds, small-team guard, badge
   downgrades), and the header stat cards (proportion display, rate-based
   coloring). No layout moves. This alone fixes the wall-of-red complaint.
2. **DASH-1b (moment-aware restructure)**: gate-driven layout switching,
   strip retitling, section reordering, stat-card merge into one
   participation row, grid sorting per moment. Depends on 1a.

Shipping 1a alone is a valid stopping point if 1b needs to wait.

## Acceptance script (for John)

1. Open the app as an admin and go to Command Center during the week, before
   deadlines, with a normal week in progress. Expect: no red anywhere on the
   page. Pending work shows as neutral counts and fractions with deadline
   chips. The heatmap shows a gradient of score colors with no red or amber
   alarm cells, and its caption describes a 1 to 4 scale.
2. Look at a location where a deadline passed and only 1 or 2 people out of
   many are late. Expect: the card stays calm with a small amber "late" chip;
   the card itself is not red.
3. Look at a location where a deadline passed and participation genuinely
   collapsed (below 60%, at least 3 people). Expect: that card and the top
   strip entry are red, and they are the only red things on the page.
4. Visit after all deadlines have passed on a good week. Expect: a quiet
   "All locations submitted" line, the heatmap near the top for coaching
   review, and calm cards with final rates.
5. (After 1b) Visit mid-week. Expect: a "Needs a nudge" list at the top,
   ordered by soonest deadline, and the heatmap at the bottom.

## Personas to test as

- admin (desktop), primary
- lead (spot-check they see nothing broken on adjacent routes)

## Out of scope

- COR-6 (sequencer confidence computed from the wrong value): separate bug,
  fix lands there, not here.
- DSN-3's app-wide token migration: this spec migrates only the Command
  Center widgets it touches.
- LocationDetail page and LocationSkillGaps widget recoloring: same
  principles should apply later, but this ticket stops at the Command Center
  page itself. One accepted exception: LocationDetail renders the same shared
  LocationHealthCard component, so its location card inherits the recolor
  (forking the component would be worse than one consistent card). The rest
  of that page is untouched.
- Any DB, RPC, or hook changes. Display logic only.
- Mobile-shell treatment of this page.

## DB impact

None.

## Docs the builder must read

- `docs/system-overview.md` (weekly loop, who uses the dashboard)
- CLAUDE.md design system conventions (tokens, icon sizes, no hardcoded
  semantic colors)
- This spec, including the anti-goals list

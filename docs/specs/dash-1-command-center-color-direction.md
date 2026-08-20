# DASH-1: Command Center color direction and at-a-glance redesign

## What and why

The Command Center (route `/dashboard`, component `RegionalDashboard`) shows lots of red even when participation numbers are good, so the page reads like everything is on fire and red stops meaning anything. The root causes are presentation, not data: the domain confidence heatmap paints normal learning-phase scores (averages under 2.5 on the 1 to 4 scale) in red, location cards go fully red on any sub-50% rate, and raw late counts are colored red regardless of proportion (3 late out of 120 looks like 30 of 40). This spec redefines what red means on the page, moves confidence scores onto a non-alarm scale, and makes the layout serve its one real audience, the regional or org admin, in their two moments: mid-week nudging and week wrap-up review.

## Locked decisions

- Red is reserved for missed-deadline participation problems only. Confidence and skill scores never render red.
- One audience: the regional/org admin. Two moments: mid-week (who needs a nudge) and wrap-up (who missed, where to coach).
- All colors come from design tokens, never hardcoded Tailwind palette classes.

## Color tiers, page-wide

| Tier | Meaning | Tokens |
|---|---|---|
| Red (alarm) | Location or org participation below the red threshold after a deadline. The only red on the page. | `--status-missing` / `-bg` |
| Amber (watch) | Deadline passed with a minor shortfall, or a deadline within hours with pending submissions | `--status-late` / `-bg` |
| Neutral (info) | Everything pre-deadline: pending counts, progress fractions, deadline chips; excused states | `--status-pending`, `--status-excused`, muted foreground |
| Good | Calm, not green: default surfaces, at most one small `--status-complete` accent (check icon or thin "On track" chip) | `--status-complete` |

Confidence averages use the `--score-1` through `--score-4` ramp (text plus `-bg`), a learning gradient, not a traffic light.

## Per-widget changes (phase 1a)

- **SignalsBanner**: keep. Migrate its hardcoded emerald/amber classes to tokens. Entries about pre-deadline pending states are amber at most; entries about genuinely missed locations (past deadline, below red threshold) may be red. Empty state becomes a plain muted line with a small complete-token icon, not a green box.
- **Summary stat cards (RegionalDashboard header cards)**: keep the three cards in place (the merge into one row is phase 1b), but change the coloring: always show proportion context, never a colored bare count. The late-conf number stops being `text-destructive`; show the rate/proportion and color the RATE only, red only past deadline and below the red threshold, amber in the watch band, otherwise neutral. "N late" renders as a muted `--status-late` chip, informational sized.
- **DomainConfidenceHeatmap**: keep the widget, replace the color logic entirely. Kill the emerald/amber/rose thresholds. Cells use the `--score-1-bg`..`--score-4-bg` ramp keyed to the rounded average (under 2.0 uses score-1, 2.0 to 2.9 score-2, 3.0 to 3.9 score-3, 4.0 score-4) with matching `--score-N` text. Mark any cell trailing its row's group average by 0.5 or more with a subtle ring or dot (the cross-location coaching signal); add a tiny legend note for it. Replace the caption with "1 to 4 self-rated confidence, higher is more confident".
- **LocationHealthCard**: card-level red (border, wash, big number in `--status-missing`) only when a deadline has passed AND the rate is in the red band. Watch band gets `--status-late` accents. Above that, plain default cards; replace the current `border-primary/30 bg-primary/5` success treatment with a default card plus the small "On Track" chip using `--status-complete` tokens. "N late" badges become `--status-late` chips, not destructive, so each card carries at most one alarm (the card itself). Pending chips stay neutral `--status-pending`.

## Thresholds

- Post-deadline location rates: red below 60%, amber 60 to 84%, neutral 85% and up (replaces 50/80).
- Small-team guard: red additionally requires at least 3 missed people, or a team of 5 or fewer with 0 to 1 submissions. A 3-person location with one absence must not go red.
- A single late person out of many never triggers more than a neutral-amber chip.
- Align the signals threshold in RegionalDashboard with these bands (signal fires below 85%; it is red-flavored only below 60% with the small-team guard) so banner and cards never disagree.

## Anti-goals

- No good/bad threshold coloring on confidence scores; the score ramp plus the trailing-cell marker is the ceiling.
- No new alarm states or severity levels; one red.
- No coloring of raw counts anywhere; only rates and proportions earn state color.
- No red anywhere before that location's deadline has passed, including the banner.
- No green celebration washes; success is quiet.
- Do not hide straggler data; demote it, never remove it.

## Out of scope for you

- Phase 1b: moment-aware layout switching, section reordering, stat-card merge, grid re-sorting. Do not do these.
- COR-6, DSN-3, LocationDetail page, LocationSkillGaps widget, mobile shell, any DB/RPC/hook changes.

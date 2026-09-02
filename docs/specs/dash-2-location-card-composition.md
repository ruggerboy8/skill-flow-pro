# DASH-2: Location health card composition redesign

Status: approved by John 2026-08-26 (with the "visible straggler" amendment
below, rule 3). Awaiting build (queued after EVAL-4, before DASH-1b).
Lane: medium
Motion ticket: DASH-2 on the MyProMoves Dev Board
Date: 2026-08-20
Builds on: DASH-1a (PR #52); tier logic in `src/lib/participationTier.ts` is
the unchanged single source of truth.

## What and why

After previewing the DASH-1a recolor, John's remaining complaint is the card
itself: the "1 Late Conf" pill still reads like an alarm even on a calm card,
it sits at the same visual level as the purely informational "Perf Window
Open" pill next to it, and the top-right corner stacks a big percentage over
a small fraction ("78%" over "3/12 perf"), which reads as two competing
numbers. This spec recomposes LocationHealthCard around one reading axis:
one big number per state, facts as quiet prose instead of pills, and at most
one chip per card that can never be louder than the card itself.

## The composition (designer-recommended "banner stat" layout)

Three rows, top to bottom: header (name plus at most one chip), stat row
(one big number left, metric fractions right in muted type), status line
(quiet prose facts). The current bottom pill-wrap row is deleted entirely.

Mid-week (conf closed, perf open, all conf in), calm card, no chip:

```
+------------------------------------------+
| Lakeside Pediatric                       |
| 12 active staff                          |
|  100%          Conf 12/12 . Perf 3/12    |
|  conf submitted                          |
|  perf window open until Fri 5pm          |
+------------------------------------------+
```

Post-deadline, good tier, 1 straggler, still calm, no chip:

```
+------------------------------------------+
| Riverbend Dental                         |
| 12 active staff                          |
|  92%           Conf 11/12 . Perf 12/12   |
|  submitted                               |
|  (clock) 1 late (conf)   <- --status-late icon + text, no fill, no pill
+------------------------------------------+
```

Post-deadline, red collapse: red border, light red wash, red chip:

```
+==========================================+
| Summit Smiles            [! 7 missed]    |
| 12 active staff                          |
|  42%           Conf 6/12 . Perf 4/12     |
|  submitted                               |
|  7 people missing: 6 conf, 5 perf        |
+==========================================+
```

## Core rules

1. **One big number per state.** Nothing else on the card is ever a second
   percentage, and a % and a fraction are never stacked vertically.
   - Nothing due yet: the conf progress fraction (e.g. `3/12`), because no
     rate is a judgment before a deadline.
   - Conf closed, perf open: the conf rate %.
   - Both closed: the combined submitted %.
   - Fully excused: a muted "Excused" wordmark, no number.
2. **At most one chip per card, never stronger than the card.** The only
   alarm-capable element is the tier chip, shown only at watch or red:
   filled pill in `--status-late(-bg)` or `--status-missing(-bg)`, 16px
   AlertCircle icon, label is the distinct missed count ("3 missed"), placed
   in the header next to the name. Excused states get a quiet outline chip
   (`--status-excused` text, no fill, no icon). A calm card has zero chips.
3. **Facts are prose, not pills.** Pending counts, window and deadline info,
   and excuse reasons are dot-separated muted phrases on the status line.
   "All in" after a clean week is muted text with a 16px `--status-complete`
   check icon, never a green pill.
   - **Late-straggler amendment (John, 2026-08-26).** A late count on a
     good/neutral card is NOT fully muted: it stays prose (no pill, no fill),
     but the late phrase gets a light accent so it catches the eye on a scan
     without reading as an alarm. Treatment: a 16px `--status-late` outline
     icon (Clock) preceding the phrase, and the phrase text itself in
     `--status-late` color, e.g. a `--status-late` "1 late (conf)". This
     mirrors the "All in" check-icon treatment (icon + colored text, never a
     fill). It stays a status-line phrase, never a chip. Everything else on
     the status line stays muted; only the late fact takes the accent.
4. **Tier is carried by treatment**: border, light wash, and big-number
   color, plus the single header chip at watch/red. No other element
   restates it.
5. **Metric fractions live right of the big number**, right-aligned, muted
   ("Conf 11/12 . Perf 8/12"). A partially excused metric's slot reads
   "Conf excused" instead of a fraction.
6. **Height budget**: the three-row structure is the card. New facts join
   the status line as another dot-separated phrase or they do not ship.

## State-by-state spec

| State | Big number | Fractions (right, muted) | Status line | Chip | Card treatment |
|---|---|---|---|---|---|
| Pre-deadline | `3/12` fraction, foreground, sub-label "checked in" | Perf only if window open | "conf due Tue 10am" | none | default |
| Conf closed, perf open, good | Conf %, foreground | Conf and Perf | "N late (conf)" with `--status-late` Clock icon + text if any (accent per rule 3), "perf open until ..." muted | none | default |
| Conf closed, perf open, watch | Conf % in `--status-late` | same | late detail | amber "N missed" | amber border, light late wash |
| Conf closed, perf open, red | Conf % in `--status-missing` | same | "N people missing: ..." | red "N missed" | red border, light missing wash |
| Both closed, good, no misses | Combined %, foreground | Conf and Perf | check icon + "All in" | none | default |
| Both closed, good, stragglers | Combined %, foreground | Conf and Perf | "1 late (conf)" with 16px `--status-late` Clock icon + `--status-late` text (accent, not muted, not a pill) | none | default |
| Both closed, watch | Combined % in `--status-late` | Conf and Perf | late breakdown | amber "N missed" | amber border + wash |
| Both closed, red | Combined % in `--status-missing` | Conf and Perf | "N people missing: X conf, Y perf" | red "N missed" | red border + wash |
| Fully excused | "Excused" wordmark, muted, reason as sub-line | none | "no submissions required" | outline excused chip | muted border, muted/20 bg |
| Partially excused | per live metric rules above | excused slot reads "Conf excused" | reason in status line | outline excused chip | tier from the live metric only |

## Anti-goals

- Any filled amber element on a card whose tier is below watch. Amber *fill*
  belongs to the tier chip exclusively. (The rule-3 straggler accent is
  `--status-late` icon + text color only, never a fill or a pill, so it is
  allowed on a good card.)
- Two numbers of different magnitudes stacked vertically anywhere.
- More than one chip on a card, or a chip restating what the wash says.
- Informational facts promoted to pill form ("Perf Window Open" as a
  bordered pill was noise; it stays prose).
- A green filled success pill. Green stays a 16px accent icon.
- Growing the card beyond the three-row height budget.

## Acceptance script (for John, in the Lovable preview)

1. Open Command Center mid-week. Every card shows one big number with the
   small fractions beside it (never stacked), and a quiet line of context
   underneath. No pills anywhere on calm cards.
2. Find a card where a deadline passed and 1 or 2 people are late. Expect:
   no chip at all; the late fact is a muted phrase in the bottom line, and
   you have to actually read the card to notice it.
3. Find (or imagine via a collapsed location) a red-tier card. Expect: red
   border, light red wash, the big percentage in red, and one red "N missed"
   chip next to the location name. Nothing else on that card is red.
4. Find an excused location. Expect a muted "Excused" card with a quiet
   outline chip, no numbers shouting.
5. Click a card: still navigates to the location detail page, where the same
   redesigned card appears (shared component).

## Personas to test as

- admin (desktop), primary
- lead spot-check on adjacent routes

## Out of scope

- Page-level layout changes (moment-aware section ordering, summary stat
  card merge): that is DASH-1b, unchanged by this spec.
- Any change to `participationTier.ts` logic, thresholds, or the distinct
  missed count. Composition only.
- The heatmap, signals banner, and summary cards.
- New data fields: the card uses only what LocationStats already carries.
- Note: LocationDetail renders this same shared component and inherits the
  redesign; that is accepted, same reasoning as DASH-1a.

## DB impact

None.

## Docs the builder must read

- This spec, including the anti-goals and the state table
- `docs/system-overview.md`
- CLAUDE.md design system conventions (tokens, icon sizes, text-2xs, no
  hardcoded semantic colors, no em dashes)
- `src/lib/participationTier.ts` (consume, do not modify)

## Ticket breakdown

Single ticket: one component, display only. Pure logic worth extracting and
testing: the status-line phrase builder (state in, ordered phrase list out)
so wording and ordering are unit-tested; the rest is JSX.

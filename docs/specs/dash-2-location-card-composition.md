# DASH-2: Location health card composition redesign

## What and why

After the DASH-1a recolor, the remaining complaint is the card itself: the "1 Late Conf" pill still reads like an alarm even on a calm card, it sits at the same visual level as the purely informational "Perf Window Open" pill, and the top-right corner stacks a big percentage over a small fraction (two competing numbers). This spec recomposes LocationHealthCard around one reading axis: one big number per state, facts as quiet prose instead of pills, and at most one chip per card that can never be louder than the card itself.

## The composition (banner-stat layout)

Three rows: header (name plus at most one chip), stat row (one big number left, metric fractions right in muted type), status line (quiet dot-separated prose facts). The current bottom pill-wrap row is deleted entirely.

Mid-week (conf closed, perf open, all conf in), calm, no chip:

```
+------------------------------------------+
| Lakeside Pediatric                       |
| 12 active staff                          |
|  100%          Conf 12/12 . Perf 3/12    |
|  conf submitted                          |
|  perf window open until Fri 5pm          |
+------------------------------------------+
```

Post-deadline, good tier, 1 straggler, calm, no chip:

```
+------------------------------------------+
| Riverbend Dental                         |
| 12 active staff                          |
|  92%           Conf 11/12 . Perf 12/12   |
|  submitted                               |
|  1 late (conf)                           |
+------------------------------------------+
```

Post-deadline, red collapse: red border, light red wash, red chip:

```
+==========================================+
| Summit Smiles            [! 7 missed]    |
| 12 active staff                          |
|  42%           Conf 6/12 . Perf 4/12     |
|  submitted                               |
|  7 people missing: 6 conf, 5 perf       |
+==========================================+
```

## Core rules

1. One big number per state; never a second percentage, never a % stacked over a fraction.
   - Nothing due yet: conf progress fraction (e.g. `3/12`), sub-label "checked in".
   - Conf closed, perf open: conf rate %.
   - Both closed: combined submitted %.
   - Fully excused: muted "Excused" wordmark, no number.
2. At most one chip per card, never stronger than the card. The only alarm-capable element is the tier chip, shown ONLY at watch or red tier: filled pill in `--status-late(-bg)` or `--status-missing(-bg)`, 16px AlertCircle, label "N missed" using the distinct missed count, placed in the header next to the name. Excused states get a quiet outline chip (`--status-excused` text, no fill, no icon). A calm card has zero chips.
3. Facts are prose, not pills. Late counts on a good/neutral card become muted text in the status line ("1 late (conf)"). Pending counts, window and deadline info, excuse reasons are dot-separated muted phrases on that line. "All in" after a clean post-deadline week is muted text with a 16px `--status-complete` check icon, never a green pill.
4. Tier is carried by treatment: border, light wash, big-number color, plus the single header chip at watch/red. No other element restates it.
5. Metric fractions right of the big number, right-aligned, muted ("Conf 11/12 . Perf 8/12"). A partially excused metric's slot reads "Conf excused" instead of a fraction.
6. Height budget: the three-row structure is the card. New facts join the status line as another dot-separated phrase.

## State-by-state spec

| State | Big number | Fractions (right, muted) | Status line | Chip | Card treatment |
|---|---|---|---|---|---|
| Pre-deadline | `3/12` fraction, foreground, sub-label "checked in" | Perf only if window open | "conf due Tue 10am" | none | default |
| Conf closed, perf open, good | Conf %, foreground | Conf and Perf | "N late (conf)" muted if any, "perf open until ..." | none | default |
| Conf closed, perf open, watch | Conf % in `--status-late` | same | late detail | amber "N missed" | amber border, light late wash |
| Conf closed, perf open, red | Conf % in `--status-missing` | same | "N people missing: ..." | red "N missed" | red border, light missing wash |
| Both closed, good, no misses | Combined %, foreground | Conf and Perf | check icon + "All in" | none | default |
| Both closed, good, stragglers | Combined %, foreground | Conf and Perf | "1 late (conf)" muted | none | default |
| Both closed, watch | Combined % in `--status-late` | Conf and Perf | late breakdown | amber "N missed" | amber border + wash |
| Both closed, red | Combined % in `--status-missing` | Conf and Perf | "N people missing: X conf, Y perf" | red "N missed" | red border + wash |
| Fully excused | "Excused" wordmark, muted, reason as sub-line | none | "no submissions required" | outline excused chip | muted border, muted/20 bg |
| Partially excused | per live metric rules above | excused slot reads "Conf excused" | reason in status line | outline excused chip | tier from the live metric only |

Notes: "distinct missed count" is stats.distinctMissedCount (already on LocationStats). The next-deadline label already arrives via the nextDeadlineLabel prop; reuse it for the "conf due Tue 10am" / "perf open until ..." phrases (lowercase the first letter if needed for prose flow). "N people missing: X conf, Y perf" uses distinctMissedCount with the per-metric counts in the breakdown; if only one metric has misses, simplify to "N people missing (conf)". Clarification (QA fix, DASH-2): for the partially excused row, "reason in status line" means the excuse reason is appended after the live metric's own normal-state phrases (late counts, window/deadline info), never in place of them - an excuse on one metric must not hide stragglers on the other, still-live metric.

## Anti-goals

- Any filled amber element on a card whose tier is below watch.
- Two numbers of different magnitudes stacked vertically anywhere.
- More than one chip on a card, or a chip restating what the wash says.
- Informational facts promoted to pill form.
- A green filled success pill; green stays a 16px accent icon.
- Growing the card beyond the three-row height budget.

// DASH-1a: pure helpers for the Domain Confidence Heatmap's non-alarm color
// ramp. Confidence/skill scores never render red - they use the 1-4
// `--score-N` learning gradient instead of a traffic light.

export type ScoreBucket = 1 | 2 | 3 | 4;

/**
 * Buckets a 1-4 self-rated confidence average into a score-ramp tier by its
 * leading digit: 1.0-1.9 -> 1, 2.0-2.9 -> 2, 3.0-3.9 -> 3, 4.0 -> 4.
 *
 * DASH-3: color follows the DISPLAYED digit. The heatmap renders the
 * one-decimal average itself, so a cell that says "2.6" must wear the
 * score-2 color; bucketing it to 3 (as half-point rounding does) hides the
 * high 2s inside the "fine" color and the mostly-2s table blends together.
 * Surfaces that display a rounded INTEGER rating (the local scoreBucket in
 * src/components/performance/ConfidenceCard.tsx and its siblings) correctly
 * keep half-point rounding, because there the displayed number is the
 * rounded rating. Do not "fix" this divergence in either direction: it is
 * deliberate, and it has already flip-flopped once via automated review.
 *
 * Returns undefined for non-finite input (NaN/Infinity) rather than
 * guessing (an earlier QA fix: NaN used to fall through every comparison
 * and silently land on bucket 4, the "best" score). Callers already treat
 * an undefined average as "no data" and render the existing muted state,
 * so this reuses that path instead of inventing a new one.
 */
export function scoreBucket(avg: number): ScoreBucket | undefined {
  if (!Number.isFinite(avg)) return undefined;
  if (avg < 2) return 1;
  if (avg < 3) return 2;
  if (avg < 4) return 3;
  return 4;
}

export interface ScoreBucketTokens {
  /** Vivid --score-N. Use for borders, dots, and other small/non-text
   * accents — NOT for text sitting on top of `bg`. At normal-text sizes
   * the vivid-on-`-bg` pair fails WCAG contrast in light mode (as low as
   * ~1.8:1). Use `ink` for text instead. */
  text: string;
  /** --score-N-bg, the pastel tint this bucket's `ink` is tuned against. */
  bg: string;
  /** --score-N-ink: a mode-aware, darker/lighter (light/dark mode) shade
   * of the same hue, designed to stay readable as TEXT on `bg`. Use this
   * for any label, count, or score number rendered on the tinted
   * background — mirrors the -bg + -ink pairing already used by
   * ConfidenceCard, TeamStaffPage, and ClinicalBaselineResults. */
  ink: string;
}

/**
 * hsl(var(--score-N)) / hsl(var(--score-N-bg)) / hsl(var(--score-N-ink))
 * strings for inline styles. An undefined bucket (no data / invalid input)
 * falls back to the same muted-foreground, no-fill treatment used elsewhere
 * for missing data — `ink` falls back to the same muted-foreground as
 * `text` since there's no tinted `bg` to be readable against.
 */
export function scoreBucketTokens(bucket: ScoreBucket | undefined): ScoreBucketTokens {
  if (bucket === undefined) {
    return { text: 'hsl(var(--muted-foreground))', bg: 'transparent', ink: 'hsl(var(--muted-foreground))' };
  }
  return {
    text: `hsl(var(--score-${bucket}))`,
    bg: `hsl(var(--score-${bucket}-bg))`,
    ink: `hsl(var(--score-${bucket}-ink))`,
  };
}

/**
 * True when a cell's average trails its row's group average by 0.5 or
 * more - the cross-location coaching signal called out in DASH-1a. This is
 * a demotion marker, not an alarm: confidence scores never go red.
 *
 * Non-finite input (DASH-1a QA fix) safely returns false: invalid data
 * should never manufacture a coaching signal.
 */
export function isTrailingCell(cellAvg: number, groupAvg: number): boolean {
  if (!Number.isFinite(cellAvg) || !Number.isFinite(groupAvg)) return false;
  return groupAvg - cellAvg >= 0.5;
}

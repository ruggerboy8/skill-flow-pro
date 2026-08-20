// DASH-1a: pure helpers for the Domain Confidence Heatmap's non-alarm color
// ramp. Confidence/skill scores never render red - they use the 1-4
// `--score-N` learning gradient instead of a traffic light.

export type ScoreBucket = 1 | 2 | 3 | 4;

/**
 * Buckets a 1-4 self-rated confidence average into a score-ramp tier.
 * Under 2.0 -> 1, 2.0 to 2.9 -> 2, 3.0 to 3.9 -> 3, 4.0 and up -> 4.
 *
 * Returns undefined for non-finite input (NaN/Infinity) rather than
 * guessing (DASH-1a QA fix: NaN used to fall through every comparison and
 * silently land on bucket 4, the "best" score). Callers already treat an
 * undefined average as "no data" and render the existing muted state, so
 * this reuses that path instead of inventing a new one.
 */
export function scoreBucket(avg: number): ScoreBucket | undefined {
  if (!Number.isFinite(avg)) return undefined;
  if (avg < 2.0) return 1;
  if (avg < 3.0) return 2;
  if (avg < 4.0) return 3;
  return 4;
}

export interface ScoreBucketTokens {
  text: string;
  bg: string;
}

/**
 * hsl(var(--score-N)) / hsl(var(--score-N-bg)) strings for inline styles.
 * An undefined bucket (no data / invalid input) falls back to the same
 * muted-foreground, no-fill treatment used elsewhere for missing data.
 */
export function scoreBucketTokens(bucket: ScoreBucket | undefined): ScoreBucketTokens {
  if (bucket === undefined) {
    return { text: 'hsl(var(--muted-foreground))', bg: 'transparent' };
  }
  return {
    text: `hsl(var(--score-${bucket}))`,
    bg: `hsl(var(--score-${bucket}-bg))`,
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

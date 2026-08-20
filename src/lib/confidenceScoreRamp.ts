// DASH-1a: pure helpers for the Domain Confidence Heatmap's non-alarm color
// ramp. Confidence/skill scores never render red - they use the 1-4
// `--score-N` learning gradient instead of a traffic light.

export type ScoreBucket = 1 | 2 | 3 | 4;

/**
 * Buckets a 1-4 self-rated confidence average into a score-ramp tier.
 * Under 2.0 -> 1, 2.0 to 2.9 -> 2, 3.0 to 3.9 -> 3, 4.0 and up -> 4.
 */
export function scoreBucket(avg: number): ScoreBucket {
  if (avg < 2.0) return 1;
  if (avg < 3.0) return 2;
  if (avg < 4.0) return 3;
  return 4;
}

export interface ScoreBucketTokens {
  text: string;
  bg: string;
}

/** hsl(var(--score-N)) / hsl(var(--score-N-bg)) strings for inline styles. */
export function scoreBucketTokens(bucket: ScoreBucket): ScoreBucketTokens {
  return {
    text: `hsl(var(--score-${bucket}))`,
    bg: `hsl(var(--score-${bucket}-bg))`,
  };
}

/**
 * True when a cell's average trails its row's group average by 0.5 or
 * more - the cross-location coaching signal called out in DASH-1a. This is
 * a demotion marker, not an alarm: confidence scores never go red.
 */
export function isTrailingCell(cellAvg: number, groupAvg: number): boolean {
  return groupAvg - cellAvg >= 0.5;
}

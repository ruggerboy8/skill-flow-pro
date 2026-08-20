import { describe, expect, it } from 'vitest';
import { isTrailingCell, scoreBucket, scoreBucketTokens } from './confidenceScoreRamp';

describe('scoreBucket', () => {
  // DASH-3: color follows the displayed leading digit. A cell showing
  // "2.6" must bucket as 2, not round up to 3, or the high 2s vanish
  // into the bucket-3 color and the heatmap blends together.
  it('buckets below 2.0 as 1', () => {
    expect(scoreBucket(0)).toBe(1);
    expect(scoreBucket(1.9)).toBe(1);
  });

  it('buckets 2.0 as 2 (boundary)', () => {
    expect(scoreBucket(2.0)).toBe(2);
  });

  it('buckets everything displayed as 2.x as 2, including the high 2s', () => {
    expect(scoreBucket(2.5)).toBe(2);
    expect(scoreBucket(2.6)).toBe(2);
    expect(scoreBucket(2.9)).toBe(2);
  });

  it('buckets 3.0 as 3 (boundary)', () => {
    expect(scoreBucket(3.0)).toBe(3);
  });

  it('buckets 3.9 as 3', () => {
    expect(scoreBucket(3.9)).toBe(3);
  });

  it('buckets 4.0 and above as 4 (boundary)', () => {
    expect(scoreBucket(4.0)).toBe(4);
    expect(scoreBucket(4.5)).toBe(4);
  });

  it('returns undefined (not bucket 4) for non-finite input (DASH-1a QA fix)', () => {
    expect(scoreBucket(NaN)).toBeUndefined();
    expect(scoreBucket(Infinity)).toBeUndefined();
    expect(scoreBucket(-Infinity)).toBeUndefined();
  });
});

describe('scoreBucketTokens', () => {
  it('maps each bucket to its matching --score-N tokens', () => {
    expect(scoreBucketTokens(1)).toEqual({ text: 'hsl(var(--score-1))', bg: 'hsl(var(--score-1-bg))' });
    expect(scoreBucketTokens(4)).toEqual({ text: 'hsl(var(--score-4))', bg: 'hsl(var(--score-4-bg))' });
  });

  it('falls back to the muted no-data treatment for an undefined bucket', () => {
    expect(scoreBucketTokens(undefined)).toEqual({ text: 'hsl(var(--muted-foreground))', bg: 'transparent' });
  });
});

describe('isTrailingCell', () => {
  it('is true at exactly a 0.5 margin (boundary)', () => {
    expect(isTrailingCell(2.0, 2.5)).toBe(true);
  });

  it('is true when the margin is more than 0.5', () => {
    expect(isTrailingCell(1.5, 2.5)).toBe(true);
  });

  it('is false when the margin is under 0.5', () => {
    expect(isTrailingCell(2.1, 2.5)).toBe(false);
  });

  it('is false when the cell is at or above the group average', () => {
    expect(isTrailingCell(2.5, 2.5)).toBe(false);
    expect(isTrailingCell(3.0, 2.5)).toBe(false);
  });

  it('safely returns false for non-finite input instead of manufacturing a signal (DASH-1a QA fix)', () => {
    expect(isTrailingCell(NaN, 2.5)).toBe(false);
    expect(isTrailingCell(2.0, NaN)).toBe(false);
    expect(isTrailingCell(Infinity, Infinity)).toBe(false);
  });
});

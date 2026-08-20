import { describe, expect, it } from 'vitest';
import { isTrailingCell, scoreBucket, scoreBucketTokens } from './confidenceScoreRamp';

describe('scoreBucket', () => {
  it('buckets below 2.0 as 1', () => {
    expect(scoreBucket(0)).toBe(1);
    expect(scoreBucket(1.9)).toBe(1);
  });

  it('buckets 2.0 as 2 (boundary)', () => {
    expect(scoreBucket(2.0)).toBe(2);
  });

  it('buckets 2.9 as 2', () => {
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
});

describe('scoreBucketTokens', () => {
  it('maps each bucket to its matching --score-N tokens', () => {
    expect(scoreBucketTokens(1)).toEqual({ text: 'hsl(var(--score-1))', bg: 'hsl(var(--score-1-bg))' });
    expect(scoreBucketTokens(4)).toEqual({ text: 'hsl(var(--score-4))', bg: 'hsl(var(--score-4-bg))' });
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
});

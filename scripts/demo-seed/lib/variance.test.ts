import { describe, it, expect } from 'vitest';
import { shapeVariance, domainLocationTargetMean, type ScoreLike } from './variance';

const DOMAINS = [1, 2, 3, 4];
const LOCATIONS = ['loc-a', 'loc-b', 'loc-c'];

function makeScores(): ScoreLike[] {
  const scores: ScoreLike[] = [];
  let week = 1;
  for (const locationId of LOCATIONS) {
    for (const domainId of DOMAINS) {
      for (let staff = 0; staff < 4; staff++) {
        scores.push({
          staffId: `staff-${locationId}-${staff}`,
          locationId,
          domainId,
          weekOf: `2026-0${week}-04`,
          confidenceScore: 2, // uniform input on purpose -- the shaping step must change this
        });
      }
    }
    week++;
  }
  return scores;
}

describe('domainLocationTargetMean', () => {
  it('stays within the 1-4 scale', () => {
    for (let d = 0; d < 4; d++) {
      for (let l = 0; l < 3; l++) {
        const mean = domainLocationTargetMean(d, l);
        expect(mean).toBeGreaterThanOrEqual(1);
        expect(mean).toBeLessThanOrEqual(4);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(domainLocationTargetMean(2, 1)).toBe(domainLocationTargetMean(2, 1));
  });

  it('does not assign the same target to every domain at a given location', () => {
    const targets = DOMAINS.map((_, dIdx) => domainLocationTargetMean(dIdx, 0));
    expect(new Set(targets).size).toBeGreaterThan(1);
  });

  it('does not assign the same target to a given domain across every location', () => {
    const targets = LOCATIONS.map((_, lIdx) => domainLocationTargetMean(0, lIdx));
    expect(new Set(targets).size).toBeGreaterThan(1);
  });
});

describe('shapeVariance', () => {
  const domainOrder = DOMAINS;
  const locationOrder = LOCATIONS;

  it('is not uniform: reshaping a uniform input produces more than one distinct score', () => {
    const shaped = shapeVariance(makeScores(), domainOrder, locationOrder);
    const distinct = new Set(shaped.map((s) => s.confidenceScore));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('never produces a null score for a row that had a real score', () => {
    const shaped = shapeVariance(makeScores(), domainOrder, locationOrder);
    expect(shaped.every((s) => s.confidenceScore !== null)).toBe(true);
  });

  it('leaves rows with a null confidence score untouched (never invents a submission)', () => {
    const scores: ScoreLike[] = [
      { staffId: 's1', locationId: 'loc-a', domainId: 1, weekOf: '2026-01-05', confidenceScore: null },
    ];
    const shaped = shapeVariance(scores, domainOrder, locationOrder);
    expect(shaped[0].confidenceScore).toBeNull();
  });

  it('stays within the 1-4 scale for every row', () => {
    const shaped = shapeVariance(makeScores(), domainOrder, locationOrder);
    for (const s of shaped) {
      expect(s.confidenceScore).toBeGreaterThanOrEqual(1);
      expect(s.confidenceScore).toBeLessThanOrEqual(4);
    }
  });

  it('is deterministic: shaping the same input twice gives the same output', () => {
    const input = makeScores();
    const first = shapeVariance(input, domainOrder, locationOrder);
    const second = shapeVariance(input, domainOrder, locationOrder);
    expect(first).toEqual(second);
  });

  it('produces both highs and lows across the whole org (not just spread within one location)', () => {
    const shaped = shapeVariance(makeScores(), domainOrder, locationOrder);
    const nonNull = shaped.map((s) => s.confidenceScore as number);
    expect(Math.min(...nonNull)).toBeLessThanOrEqual(2);
    expect(Math.max(...nonNull)).toBeGreaterThanOrEqual(3);
  });

  it('passes through rows whose domain or location is not in the given order lists', () => {
    const scores: ScoreLike[] = [
      { staffId: 's1', locationId: 'unknown-loc', domainId: 1, weekOf: '2026-01-05', confidenceScore: 2 },
    ];
    const shaped = shapeVariance(scores, domainOrder, locationOrder);
    expect(shaped[0].confidenceScore).toBe(2);
  });
});

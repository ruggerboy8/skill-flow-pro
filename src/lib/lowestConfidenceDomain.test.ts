import { describe, it, expect } from 'vitest';
import { computeDomainAverages, pickLowestConfidenceDomain } from './lowestConfidenceDomain';

describe('computeDomainAverages', () => {
  it('sums confidence_score by domain_name and skips null scores', () => {
    const map = computeDomainAverages([
      { domain_name: 'Clinical', confidence_score: 4 },
      { domain_name: 'Clinical', confidence_score: 2 },
      { domain_name: 'Clerical', confidence_score: null },
      { domain_name: 'Clerical', confidence_score: 3 },
    ]);
    expect(map.get('Clinical')).toEqual({ sum: 6, count: 2 });
    expect(map.get('Clerical')).toEqual({ sum: 3, count: 1 });
  });

  it('returns an empty map for no rows', () => {
    expect(computeDomainAverages([]).size).toBe(0);
  });
});

describe('pickLowestConfidenceDomain', () => {
  it('picks the domain with the lowest average across normal multi-domain data', () => {
    const map = computeDomainAverages([
      { domain_name: 'Clinical', confidence_score: 4 },
      { domain_name: 'Clinical', confidence_score: 4 },
      { domain_name: 'Clerical', confidence_score: 2 },
      { domain_name: 'Cultural', confidence_score: 3 },
      { domain_name: 'Case Acceptance', confidence_score: 3.5 },
    ]);
    expect(pickLowestConfidenceDomain(map)).toBe('Clerical');
  });

  it('breaks a tie by DOMAIN_ORDER position (Clinical before Cultural)', () => {
    const map = computeDomainAverages([
      { domain_name: 'Cultural', confidence_score: 2 },
      { domain_name: 'Clinical', confidence_score: 2 },
    ]);
    expect(pickLowestConfidenceDomain(map)).toBe('Clinical');
  });

  it('breaks a tie the same way regardless of which domain was aggregated first', () => {
    const map = computeDomainAverages([
      { domain_name: 'Clinical', confidence_score: 2 },
      { domain_name: 'Cultural', confidence_score: 2 },
    ]);
    expect(pickLowestConfidenceDomain(map)).toBe('Clinical');
  });

  it('returns null for an empty/sparse-data case (new hire, no scores)', () => {
    expect(pickLowestConfidenceDomain(new Map())).toBeNull();
    expect(pickLowestConfidenceDomain(computeDomainAverages([
      { domain_name: 'Clinical', confidence_score: null },
    ]))).toBeNull();
  });
});

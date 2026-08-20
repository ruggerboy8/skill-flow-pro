import { describe, it, expect } from 'vitest';
import { sortByDomainOrder, parseReviewPayload } from './reviewPayload';

describe('sortByDomainOrder', () => {
  it('reorders items into the canonical Clinical/Clerical/Cultural/Case Acceptance order', () => {
    const input = [
      { domain_name: 'Case Acceptance' },
      { domain_name: 'Clinical' },
      { domain_name: 'Cultural' },
      { domain_name: 'Clerical' },
    ];

    expect(sortByDomainOrder(input).map(d => d.domain_name)).toEqual([
      'Clinical',
      'Clerical',
      'Cultural',
      'Case Acceptance',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [{ domain_name: 'Cultural' }, { domain_name: 'Clinical' }];
    const original = [...input];

    sortByDomainOrder(input);

    expect(input).toEqual(original);
  });

  it('pushes unrecognized domain names to the end without erroring', () => {
    const input = [
      { domain_name: 'Mystery Domain' },
      { domain_name: 'Cultural' },
      { domain_name: 'Clinical' },
    ];

    expect(sortByDomainOrder(input).map(d => d.domain_name)).toEqual([
      'Clinical',
      'Cultural',
      'Mystery Domain',
    ]);
  });
});

describe('parseReviewPayload', () => {
  it('sorts domain_summaries and domain_breakdown into canonical domain order', () => {
    const raw = {
      version: 4,
      computed_at: '2026-01-01T00:00:00Z',
      sparse: true,
      top_candidates: [],
      bottom_candidates: [],
      top_used_fallback: false,
      domain_summaries: [
        { domain_name: 'Case Acceptance', observer_avg: 3, self_avg: null, count_scored: 1 },
        { domain_name: 'Clerical', observer_avg: 3, self_avg: null, count_scored: 1 },
        { domain_name: 'Clinical', observer_avg: 3, self_avg: null, count_scored: 1 },
        { domain_name: 'Cultural', observer_avg: 3, self_avg: null, count_scored: 1 },
      ],
      domain_breakdown: [
        { domain_name: 'Cultural', observer_avg: 3, items: [] },
        { domain_name: 'Case Acceptance', observer_avg: 3, items: [] },
        { domain_name: 'Clinical', observer_avg: 3, items: [] },
        { domain_name: 'Clerical', observer_avg: 3, items: [] },
      ],
    };

    const parsed = parseReviewPayload(raw);

    expect(parsed?.domain_summaries.map(d => d.domain_name)).toEqual([
      'Clinical',
      'Clerical',
      'Cultural',
      'Case Acceptance',
    ]);
    expect(parsed?.domain_breakdown.map(d => d.domain_name)).toEqual([
      'Clinical',
      'Clerical',
      'Cultural',
      'Case Acceptance',
    ]);
  });

  it('returns null for a payload missing the top_candidates marker', () => {
    expect(parseReviewPayload({ domain_summaries: [] })).toBeNull();
    expect(parseReviewPayload(null)).toBeNull();
  });
});

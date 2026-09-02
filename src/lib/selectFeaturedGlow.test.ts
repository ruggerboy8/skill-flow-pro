import { describe, it, expect } from 'vitest';
import { selectFeaturedGlow, type GlowCandidate } from './selectFeaturedGlow';

const glow = (over: Partial<GlowCandidate>): GlowCandidate => ({
  observerGlow: 'Great work',
  domainName: 'Clinical',
  giverName: 'Ariyana',
  recencyDate: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('selectFeaturedGlow', () => {
  it('Tier 1: picks the most recent glow in the lowest-confidence domain when one exists', () => {
    const older = glow({ observerGlow: 'older clinical glow', domainName: 'Clinical', recencyDate: '2026-01-01T00:00:00.000Z' });
    const newer = glow({ observerGlow: 'newer clinical glow', domainName: 'Clinical', recencyDate: '2026-02-01T00:00:00.000Z' });
    const clerical = glow({ observerGlow: 'clerical glow', domainName: 'Clerical', recencyDate: '2026-03-01T00:00:00.000Z' });

    const result = selectFeaturedGlow([older, newer, clerical], 'Clinical');
    expect(result?.observerGlow).toBe('newer clinical glow');
  });

  it('Tier 2: falls back to the most recent glow in any domain when none exists in the lowest-confidence domain', () => {
    const clerical = glow({ observerGlow: 'clerical glow', domainName: 'Clerical', recencyDate: '2026-01-01T00:00:00.000Z' });
    const cultural = glow({ observerGlow: 'cultural glow', domainName: 'Cultural', recencyDate: '2026-02-01T00:00:00.000Z' });

    const result = selectFeaturedGlow([clerical, cultural], 'Clinical');
    expect(result?.observerGlow).toBe('cultural glow');
  });

  it('Tier 2: falls straight to "any recent" when there is no confidence data at all (new hire)', () => {
    const only = glow({ observerGlow: 'the only glow', recencyDate: '2026-01-01T00:00:00.000Z' });
    const result = selectFeaturedGlow([only], null);
    expect(result?.observerGlow).toBe('the only glow');
  });

  it('Tier 3: returns null when there are no glows at all', () => {
    expect(selectFeaturedGlow([], 'Clinical')).toBeNull();
    expect(selectFeaturedGlow([], null)).toBeNull();
  });

  it('does not mutate the input array order', () => {
    const first = glow({ observerGlow: 'first', recencyDate: '2026-01-01T00:00:00.000Z' });
    const second = glow({ observerGlow: 'second', recencyDate: '2026-02-01T00:00:00.000Z' });
    const input = [first, second];
    selectFeaturedGlow(input, null);
    expect(input[0]).toBe(first);
    expect(input[1]).toBe(second);
  });

  it('never features a glow whose giverName could not be resolved by guessing a name (passes null through)', () => {
    const unattributed = glow({ observerGlow: 'old glow, no source', giverName: null, recencyDate: '2026-01-01T00:00:00.000Z' });
    const result = selectFeaturedGlow([unattributed], null);
    expect(result?.giverName).toBeNull();
  });
});

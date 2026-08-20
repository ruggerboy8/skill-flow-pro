import { describe, it, expect } from 'vitest';
import { HOME_FEED_ORDER, RITUAL_HERO_CARD_ID } from './homeFeedOrder';

describe('HOME_FEED_ORDER', () => {
  it('pins the ritual hero (ThisWeekPanel) first, in every week-state', () => {
    expect(HOME_FEED_ORDER[0]).toBe('ritual-hero');
    expect(RITUAL_HERO_CARD_ID).toBe('ritual-hero');
  });

  it('has no duplicate card ids, so rank is unambiguous', () => {
    expect(new Set(HOME_FEED_ORDER).size).toBe(HOME_FEED_ORDER.length);
  });

  it('includes the MOB-3 focus-value card after the focus move is known', () => {
    const focusIndex = HOME_FEED_ORDER.indexOf('current-focus' as any);
    const valueIndex = HOME_FEED_ORDER.indexOf('focus-value' as any);
    expect(focusIndex).toBeGreaterThanOrEqual(0);
    expect(valueIndex).toBeGreaterThan(focusIndex);
  });
});

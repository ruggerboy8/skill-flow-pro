// This suite must pass under any host TZ (the machine/CI runner running
// it), not just America/Chicago or UTC. CI runs it under TZ=UTC,
// TZ=America/Chicago, TZ=Pacific/Kiritimati, and TZ=America/Los_Angeles.
// See COR-1.

import { describe, it, expect } from 'vitest';
import { getChicagoMonday, normalizeToPlannerWeek, getNextMondayChicago } from './plannerUtils';

describe('getChicagoMonday', () => {
  it('accepts a Date instant and returns that week\'s Monday', () => {
    const now = new Date('2026-08-12T20:00:00Z'); // Wednesday CDT
    expect(getChicagoMonday(now)).toBe('2026-08-10');
  });

  it('accepts a date-only string and treats it as that calendar date in Chicago, not the machine\'s own timezone', () => {
    expect(getChicagoMonday('2026-08-12')).toBe('2026-08-10');
  });

  it('a Monday string normalizes to itself', () => {
    expect(getChicagoMonday('2026-08-10')).toBe('2026-08-10');
  });

  it('a Sunday string resolves to the preceding Monday, not the next one', () => {
    expect(getChicagoMonday('2026-08-16')).toBe('2026-08-10');
  });

  it('is DST-safe across the spring-forward week', () => {
    // Sunday Mar 8 2026 (the transition day itself) should still resolve to
    // Monday Mar 2, that week's start.
    expect(getChicagoMonday('2026-03-08')).toBe('2026-03-02');
  });
});

describe('normalizeToPlannerWeek', () => {
  it('delegates to getChicagoMonday', () => {
    expect(normalizeToPlannerWeek('2026-08-12')).toBe(getChicagoMonday('2026-08-12'));
  });
});

describe('getNextMondayChicago', () => {
  it('never returns today, even if today is Monday', () => {
    const now = new Date('2026-08-10T18:00:00Z'); // Monday afternoon CDT
    expect(getNextMondayChicago(now)).toBe('2026-08-17');
  });

  it('returns the upcoming Monday from a midweek day', () => {
    const now = new Date('2026-08-12T20:00:00Z'); // Wednesday
    expect(getNextMondayChicago(now)).toBe('2026-08-17');
  });
});

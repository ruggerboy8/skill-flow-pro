// Tests for getLocationWeekContext — the function that figures out, for a
// given location and moment in time, "what week and cycle is it right now?"
//
// Some vocabulary, for anyone reading this without the Supabase/date-fns
// context (see docs/glossary.md for the full definitions):
//   - A "cycle" is a block of weeks (this location uses 6-week cycles).
//   - "Week in cycle" is the position within that block: 1 through 6, then
//     it wraps back to 1 for the next cycle.
//   - The work week runs Monday-Friday. Confidence (check-in) is due
//     Tuesday, performance (check-out) is due Friday at 5pm. Until Friday
//     5pm has passed, staff are still finishing the *previous* week's
//     assignments, so the function deliberately looks one week back during
//     that window — one of the test cases below exercises exactly that.
//
// Each test queues a canned `locations` row (the only table this function
// queries) using the Supabase test double, calls the real function, and
// checks the week/cycle numbers that come back.

import { describe, it, expect } from 'vitest';
import { getLocationWeekContext } from './locationState';
import { queueTable, getTableCalls } from '@/test/supabaseMock';

// A location that started its program on Monday, January 5th 2026, running
// in UTC with 6-week cycles and the platform's default confidence/
// performance deadlines (no per-location override).
function makeLocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loc-1',
    name: 'Test Location',
    program_start_date: '2026-01-05',
    cycle_length_weeks: 6,
    timezone: 'UTC',
    conf_due_day: null,
    conf_due_time: null,
    perf_due_day: null,
    perf_due_time: null,
    ...overrides,
  };
}

describe('getLocationWeekContext', () => {
  it('reports week 3 of cycle 1 on a Saturday, three weeks after the program started', async () => {
    queueTable('locations', { data: makeLocationRow(), error: null });

    // Saturday, three weeks after the Jan 5 program start, after that
    // week's Friday-5pm performance deadline has already passed.
    const now = new Date('2026-01-24T20:00:00Z');

    const ctx = await getLocationWeekContext('loc-1', now);

    expect(ctx.cycleNumber).toBe(1);
    expect(ctx.weekInCycle).toBe(3);
  });

  it('rolls over into cycle 2, week 1 once six weeks have passed', async () => {
    queueTable('locations', { data: makeLocationRow(), error: null });

    // Saturday of the 7th week after program start (index 6, 0-based),
    // after that week's performance deadline — with 6-week cycles this is
    // the first week of the second cycle.
    const now = new Date('2026-02-21T20:00:00Z');

    const ctx = await getLocationWeekContext('loc-1', now);

    expect(ctx.cycleNumber).toBe(2);
    expect(ctx.weekInCycle).toBe(1);
  });

  it('still counts as the previous week while performance is not yet due', async () => {
    queueTable('locations', { data: makeLocationRow(), error: null });

    // Tuesday of week 3 (index 2), *before* that week's Friday 5pm
    // performance deadline. Staff are still finishing week 2's work, so
    // this should report week 2, not week 3.
    const now = new Date('2026-01-20T10:00:00Z');

    const ctx = await getLocationWeekContext('loc-1', now);

    expect(ctx.cycleNumber).toBe(1);
    expect(ctx.weekInCycle).toBe(2);
  });

  it('queries the locations table by id and stops there', async () => {
    queueTable('locations', { data: makeLocationRow(), error: null });

    await getLocationWeekContext('loc-1', new Date('2026-01-24T20:00:00Z'));

    const calls = getTableCalls('locations');
    expect(calls).toHaveLength(1);
    expect(calls[0].filters).toContainEqual({ op: 'eq', args: ['id', 'loc-1'] });
  });

  it('throws a clear error when the location does not exist', async () => {
    queueTable('locations', { data: null, error: null });

    await expect(getLocationWeekContext('missing-loc')).rejects.toThrow('Location not found');
  });
});

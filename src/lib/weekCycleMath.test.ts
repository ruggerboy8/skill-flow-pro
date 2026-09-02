// TST-3 tests for computeWeekCycleMath — the pure week-index / cycle
// arithmetic extracted out of getLocationWeekContext (locationState.ts).
//
// These are characterization tests: they pin what the math does today
// (including the legacy cycleNumber/weekInCycle wraparound John flagged as
// pending removal), not a redesign of it. getLocationWeekContext.test.ts in
// this same directory covers the same math end-to-end through the real
// Supabase-backed function; these tests isolate just the arithmetic so a
// wrong week/cycle calculation fails fast without any DB mocking.

import { describe, it, expect } from 'vitest';
import { computeWeekCycleMath, type WeekCycleMathInput } from './weekCycleMath';

// Both Dates below are UTC midnight Mondays — matching how the real caller
// passes in `anchors.mondayZ` values (already resolved to a specific tz).
const PROGRAM_START_MONDAY = new Date('2026-01-05T00:00:00Z');

function monday(weeksAfterStart: number): Date {
  return new Date(PROGRAM_START_MONDAY.getTime() + weeksAfterStart * 7 * 24 * 60 * 60 * 1000);
}

function baseInput(overrides: Partial<WeekCycleMathInput> = {}): WeekCycleMathInput {
  return {
    cycleLength: 6,
    currentMonday: monday(0),
    programStartMonday: PROGRAM_START_MONDAY,
    beforePerformanceDeadline: false,
    ...overrides,
  };
}

describe('computeWeekCycleMath', () => {
  it('is week 1 of cycle 1 in the program-start week itself', () => {
    const result = computeWeekCycleMath(baseInput({ currentMonday: monday(0) }));
    expect(result).toEqual({ weekIndex: 0, cycleNumber: 1, weekInCycle: 1 });
  });

  it('reports a mid-cycle week (week 3 of a 6-week cycle) correctly', () => {
    const result = computeWeekCycleMath(baseInput({ currentMonday: monday(2) }));
    expect(result).toEqual({ weekIndex: 2, cycleNumber: 1, weekInCycle: 3 });
  });

  it('rolls week index 5 (the last week of cycle 1) into weekInCycle 6', () => {
    const result = computeWeekCycleMath(baseInput({ currentMonday: monday(5) }));
    expect(result).toEqual({ weekIndex: 5, cycleNumber: 1, weekInCycle: 6 });
  });

  it('crosses the cycle boundary into cycle 2, week 1 at week index 6', () => {
    const result = computeWeekCycleMath(baseInput({ currentMonday: monday(6) }));
    expect(result).toEqual({ weekIndex: 6, cycleNumber: 2, weekInCycle: 1 });
  });

  it('crosses a second cycle boundary into cycle 3, week 1 at week index 12', () => {
    const result = computeWeekCycleMath(baseInput({ currentMonday: monday(12) }));
    expect(result).toEqual({ weekIndex: 12, cycleNumber: 3, weekInCycle: 1 });
  });

  it('honors a different cycle length (4 weeks)', () => {
    const result = computeWeekCycleMath(
      baseInput({ cycleLength: 4, currentMonday: monday(4) })
    );
    expect(result).toEqual({ weekIndex: 4, cycleNumber: 2, weekInCycle: 1 });
  });

  it('steps back to the previous week while still before the performance deadline', () => {
    // Same calendar week as week index 3, but staff are still finishing
    // week index 2's assignments because Friday 5pm hasn't passed yet.
    const before = computeWeekCycleMath(
      baseInput({ currentMonday: monday(3), beforePerformanceDeadline: true })
    );
    expect(before).toEqual({ weekIndex: 2, cycleNumber: 1, weekInCycle: 3 });

    // Once the deadline has passed, the same calendar week reports its own index.
    const after = computeWeekCycleMath(
      baseInput({ currentMonday: monday(3), beforePerformanceDeadline: false })
    );
    expect(after).toEqual({ weekIndex: 3, cycleNumber: 1, weekInCycle: 4 });
  });

  it('does not step back past week index 0 (program-start week, before deadline)', () => {
    const result = computeWeekCycleMath(
      baseInput({ currentMonday: monday(0), beforePerformanceDeadline: true })
    );
    // weekIndex > 0 guard means index 0 stays 0, never goes negative.
    expect(result).toEqual({ weekIndex: 0, cycleNumber: 1, weekInCycle: 1 });
  });

  it('stepping back from the first week of cycle 2 lands on the last week of cycle 1', () => {
    const result = computeWeekCycleMath(
      baseInput({ currentMonday: monday(6), beforePerformanceDeadline: true })
    );
    expect(result).toEqual({ weekIndex: 5, cycleNumber: 1, weekInCycle: 6 });
  });
});

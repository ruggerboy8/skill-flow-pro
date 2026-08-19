// This suite must pass under any host TZ (the machine/CI runner running
// it), not just America/Chicago or UTC. CI runs it under TZ=UTC,
// TZ=America/Chicago, TZ=Pacific/Kiritimati, and TZ=America/Los_Angeles.
// See COR-1.

import { describe, it, expect } from 'vitest';
import {
  dateStringToInstant,
  instantToDateString,
  isoDayOfWeekInTz,
  addDaysToDateString,
  nextMondayInTimezone,
  mondayInTimezone,
  mondaysInMonth,
  firstMondayOfMonth,
} from './dateUtils';

const CHICAGO = 'America/Chicago';
const LONDON = 'Europe/London';

describe('instantToDateString / dateStringToInstant', () => {
  it('round-trips a calendar date through an instant without shifting the day', () => {
    const instant = dateStringToInstant('2026-08-12', CHICAGO);
    expect(instantToDateString(instant, CHICAGO)).toBe('2026-08-12');
  });

  it('does not shift the date for a negative-UTC timezone at local midnight (the COR-1 bug)', () => {
    // Local midnight in Chicago is 05:00 or 06:00 UTC (the next UTC day).
    // toISOString().split('T')[0] on that instant would read back the
    // previous day; instantToDateString must not.
    const instant = dateStringToInstant('2026-01-15', CHICAGO);
    expect(instant.toISOString()).toBe('2026-01-15T06:00:00.000Z'); // CST, UTC-6
    expect(instantToDateString(instant, CHICAGO)).toBe('2026-01-15');
  });
});

describe('isoDayOfWeekInTz', () => {
  it('reads the day-of-week as observed in the given timezone, not the machine\'s own', () => {
    // Aug 10 2026 05:00 UTC is Monday 00:00 in Chicago (CDT) but still
    // Monday 05:00 in UTC and Monday 06:00 in London (BST) too, so pick an
    // instant that actually differs by calendar day between two zones:
    // Aug 10 2026 03:00 UTC is Aug 10 04:00 BST (Monday) but Aug 9 22:00 CDT
    // (Sunday) in Chicago.
    const instant = new Date('2026-08-10T03:00:00Z');
    expect(isoDayOfWeekInTz(instant, LONDON)).toBe(1); // Monday
    expect(isoDayOfWeekInTz(instant, CHICAGO)).toBe(7); // Sunday
  });
});

describe('addDaysToDateString', () => {
  it('adds whole days within a month', () => {
    expect(addDaysToDateString('2026-08-10', 7, CHICAGO)).toBe('2026-08-17');
  });

  it('subtracts days across a month boundary', () => {
    expect(addDaysToDateString('2026-08-01', -1, CHICAGO)).toBe('2026-07-31');
  });

  it('is DST-safe: adding 7 days across the spring-forward transition still lands on the same weekday', () => {
    // Mon Mar 2 2026 + 7 days should be Mon Mar 9 2026, even though the
    // week in between loses an hour to DST.
    expect(addDaysToDateString('2026-03-02', 7, CHICAGO)).toBe('2026-03-09');
  });

  it('is DST-safe across the fall-back transition too', () => {
    expect(addDaysToDateString('2026-10-26', 7, CHICAGO)).toBe('2026-11-02');
  });
});

describe('mondaysInMonth', () => {
  it('lists every Monday in a calendar month', () => {
    // August 2026: Mondays fall on the 3rd, 10th, 17th, 24th, 31st.
    expect(mondaysInMonth('2026-08-01', CHICAGO)).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
    ]);
  });

  it('works from any anchor date within the month, not just the 1st', () => {
    expect(mondaysInMonth('2026-08-19', CHICAGO)).toEqual(mondaysInMonth('2026-08-01', CHICAGO));
  });

  it('spans a DST transition within the month correctly', () => {
    // March 2026: DST starts Sunday Mar 8. Mondays: 2, 9, 16, 23, 30.
    expect(mondaysInMonth('2026-03-01', CHICAGO)).toEqual([
      '2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30',
    ]);
  });
});

describe('firstMondayOfMonth', () => {
  it('returns the first Monday of the month containing the given date', () => {
    expect(firstMondayOfMonth('2026-08-19', CHICAGO)).toBe('2026-08-03');
  });
});

describe('mondayInTimezone', () => {
  it('matches resolveMonday, formatted as a date string', () => {
    const now = new Date('2026-08-12T20:00:00Z'); // Wednesday
    expect(mondayInTimezone(CHICAGO, now)).toBe('2026-08-10');
  });
});

describe('nextMondayInTimezone', () => {
  it('never returns today, even if today is Monday', () => {
    const now = new Date('2026-08-10T18:00:00Z'); // Monday afternoon CDT
    expect(nextMondayInTimezone(CHICAGO, now)).toBe('2026-08-17');
  });

  it('returns the upcoming Monday from a Sunday', () => {
    const now = new Date('2026-08-16T12:00:00Z'); // Sunday
    expect(nextMondayInTimezone(CHICAGO, now)).toBe('2026-08-17');
  });

  it('is timezone-aware: the same instant can resolve to different calendar dates in different zones', () => {
    // 2026-08-10T02:00:00Z is Sunday Aug 9 in Chicago (CDT, UTC-5) but
    // Monday Aug 10 in London (BST, UTC+1).
    const instant = new Date('2026-08-10T02:00:00Z');
    expect(nextMondayInTimezone(CHICAGO, instant)).toBe('2026-08-10'); // next Monday from Sunday
    expect(nextMondayInTimezone(LONDON, instant)).toBe('2026-08-17'); // next Monday from Monday (today excluded)
  });
});

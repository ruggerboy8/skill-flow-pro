// Mirrors the host-TZ-independence discipline from src/lib/dateUtils.test.ts
// (COR-1): this math must give the same answer no matter what timezone the
// machine running the seed script happens to be in, since it delegates to
// the same calendar-date helpers.

import { describe, it, expect } from 'vitest';
import {
  computeWeekShiftDays,
  shiftDateString,
  daysBetweenDateStrings,
  repointWeeks,
  weekInCycle,
} from './refreshWeek';

const CHICAGO = 'America/Chicago';
const LONDON = 'Europe/London';

describe('daysBetweenDateStrings', () => {
  it('is 0 for the same date', () => {
    expect(daysBetweenDateStrings('2026-08-10', '2026-08-10')).toBe(0);
  });

  it('is positive when moving forward', () => {
    expect(daysBetweenDateStrings('2026-08-10', '2026-08-17')).toBe(7);
  });

  it('is negative when moving backward', () => {
    expect(daysBetweenDateStrings('2026-08-17', '2026-08-10')).toBe(-7);
  });

  it('crosses a month boundary correctly', () => {
    expect(daysBetweenDateStrings('2026-07-28', '2026-08-04')).toBe(7);
  });
});

describe('computeWeekShiftDays', () => {
  it('is 0 when the copied "current" week is already this week\'s Monday (re-running --refresh mid-week is a no-op)', () => {
    // Aug 10 2026 is a Monday. Any instant that week, in Chicago, should
    // resolve back to Aug 10 as the Monday.
    const now = new Date('2026-08-12T18:00:00Z'); // Wed afternoon UTC
    const shift = computeWeekShiftDays('2026-08-10', now, CHICAGO);
    expect(shift).toBe(0);
  });

  it('shifts forward by whole weeks when the copied data is several weeks stale', () => {
    const now = new Date('2026-08-31T12:00:00Z'); // Monday Aug 31 2026, midday UTC
    const shift = computeWeekShiftDays('2026-08-10', now, CHICAGO);
    expect(shift).toBe(21); // 3 weeks
  });

  it('gives the same shift for the same wall-clock week regardless of which weekday `now` falls on', () => {
    const mon = computeWeekShiftDays('2026-08-10', new Date('2026-08-31T06:00:00Z'), CHICAGO);
    const fri = computeWeekShiftDays('2026-08-10', new Date('2026-09-04T22:00:00Z'), CHICAGO);
    expect(mon).toBe(fri);
  });

  it('resolves the target Monday per the given IANA timezone, not the host machine\'s zone', () => {
    // Late Sunday US-Central time is already Monday in London.
    const now = new Date('2026-08-31T02:00:00Z'); // Sun 21:00 CDT / Mon 03:00 BST
    const chicagoShift = computeWeekShiftDays('2026-08-10', now, CHICAGO);
    const londonShift = computeWeekShiftDays('2026-08-10', now, LONDON);
    expect(londonShift).toBe(chicagoShift + 7); // London has already rolled to next Monday
  });
});

describe('shiftDateString', () => {
  it('returns the same string unchanged for a 0 shift', () => {
    expect(shiftDateString('2026-08-10', 0)).toBe('2026-08-10');
  });

  it('shifts forward and backward correctly', () => {
    expect(shiftDateString('2026-08-10', 7)).toBe('2026-08-17');
    expect(shiftDateString('2026-08-10', -7)).toBe('2026-08-03');
  });
});

describe('repointWeeks', () => {
  interface Row {
    id: string;
    week_start_date: string;
  }
  const rows: Row[] = [
    { id: 'w1', week_start_date: '2026-07-27' },
    { id: 'w2', week_start_date: '2026-08-03' },
    { id: 'w3', week_start_date: '2026-08-10' }, // the "current" week at copy time
  ];
  const get = (r: Row) => r.week_start_date;
  const set = (r: Row, w: string): Row => ({ ...r, week_start_date: w });

  it('applies the same shift to every row, preserving week-to-week spacing', () => {
    const shifted = repointWeeks(rows, 21, get, set);
    expect(shifted.map((r) => r.week_start_date)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('is a no-op copy for a 0 shift', () => {
    const shifted = repointWeeks(rows, 0, get, set);
    expect(shifted).toEqual(rows);
    expect(shifted).not.toBe(rows); // still a new array, not the same reference
  });

  it('does not mutate the input rows', () => {
    const before = rows.map((r) => ({ ...r }));
    repointWeeks(rows, 14, get, set);
    expect(rows).toEqual(before);
  });
});

describe('end-to-end: compute then repoint lands the "current" week exactly on this week\'s Monday', () => {
  it('the last row in the shifted batch equals the target Monday', () => {
    const now = new Date('2026-08-31T12:00:00Z');
    const shift = computeWeekShiftDays('2026-08-10', now, CHICAGO);

    interface Row {
      week_start_date: string;
    }
    const rows: Row[] = [{ week_start_date: '2026-08-10' }];
    const shifted = repointWeeks(
      rows,
      shift,
      (r) => r.week_start_date,
      (_r, w) => ({ week_start_date: w }),
    );
    expect(shifted[0].week_start_date).toBe('2026-08-31');
  });
});

describe('weekInCycle', () => {
  it('week 1 of cycle 1 is the program start date itself', () => {
    expect(weekInCycle('2026-01-05', '2026-01-05', 6)).toEqual({ cycle: 1, weekInCycle: 1 });
  });

  it('advances week-in-cycle within the first cycle', () => {
    expect(weekInCycle('2026-01-05', '2026-01-12', 6)).toEqual({ cycle: 1, weekInCycle: 2 });
    expect(weekInCycle('2026-01-05', '2026-02-02', 6)).toEqual({ cycle: 1, weekInCycle: 5 });
  });

  it('rolls into cycle 2 at week-in-cycle 1 after cycleLengthWeeks weeks', () => {
    expect(weekInCycle('2026-01-05', '2026-02-16', 6)).toEqual({ cycle: 2, weekInCycle: 1 });
  });

  it('matches the mid-program anchor the seed script uses (15 weeks elapsed, 6-week cycles = cycle 3, week 4)', () => {
    const programStart = '2026-01-05';
    const currentWeek = shiftDateString(programStart, 15 * 7);
    expect(weekInCycle(programStart, currentWeek, 6)).toEqual({ cycle: 3, weekInCycle: 4 });
  });
});

describe('--refresh preserves cycle position (Issue 3): shifting week_start_date and ' +
  'program_start_date by the same amount leaves weekInCycle unchanged', () => {
  const programStart = '2026-01-05';
  const cycleLengthWeeks = 6;

  it('is invariant for a variety of shifts, including shifts that are not whole cycles', () => {
    const currentWeek = shiftDateString(programStart, 15 * 7); // cycle 3, week 4
    const before = weekInCycle(programStart, currentWeek, cycleLengthWeeks);

    for (const shiftWeeks of [1, 2, 3, 4, 5, 6, 7, 13, 26, 52]) {
      const shiftDays = shiftWeeks * 7;
      const shiftedProgramStart = shiftDateString(programStart, shiftDays);
      const shiftedCurrentWeek = shiftDateString(currentWeek, shiftDays);
      const after = weekInCycle(shiftedProgramStart, shiftedCurrentWeek, cycleLengthWeeks);
      expect(after).toEqual(before);
    }
  });

  it('demonstrates the Issue 3 bug: shifting week_start_date without also shifting program_start_date breaks cycle position', () => {
    // This is the Issue 3 regression: --refresh used to shift week_start_date
    // but never program_start_date. Demonstrating the drift here documents
    // why shifting both together (tested above) is required.
    const currentWeek = shiftDateString(programStart, 15 * 7); // cycle 3, week 4
    const before = weekInCycle(programStart, currentWeek, cycleLengthWeeks);

    const shiftDays = 7 * 7; // 7 weeks forward
    const shiftedCurrentWeekOnly = shiftDateString(currentWeek, shiftDays);
    const afterBuggyRefresh = weekInCycle(programStart, shiftedCurrentWeekOnly, cycleLengthWeeks);

    expect(afterBuggyRefresh).not.toEqual(before);
  });

  it('a realistic multi-refresh scenario (several weeks apart) keeps landing at the same week-in-cycle', () => {
    const currentWeek = shiftDateString(programStart, 15 * 7);
    const before = weekInCycle(programStart, currentWeek, cycleLengthWeeks);

    // Simulate three separate --refresh runs, each some weeks after the last.
    let runningProgramStart = programStart;
    let runningCurrentWeek = currentWeek;
    for (const gapWeeks of [3, 9, 1]) {
      const shiftDays = gapWeeks * 7;
      runningProgramStart = shiftDateString(runningProgramStart, shiftDays);
      runningCurrentWeek = shiftDateString(runningCurrentWeek, shiftDays);
      expect(weekInCycle(runningProgramStart, runningCurrentWeek, cycleLengthWeeks)).toEqual(before);
    }
  });
});

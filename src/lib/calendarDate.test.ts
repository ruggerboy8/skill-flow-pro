// These tests must pass under any host TZ (the machine/CI runner running
// them), not just America/Chicago or UTC. That is the entire point of
// calendarDate.ts: it must give the same answer regardless of the host's
// own local timezone or DST rules. CI runs this suite under TZ=UTC,
// TZ=America/Chicago, TZ=Pacific/Kiritimati, and TZ=America/Los_Angeles.
// See COR-1.

import { describe, it, expect } from 'vitest';
import { addCalendarDays } from './calendarDate';

describe('addCalendarDays', () => {
  it('adds whole days within a month', () => {
    expect(addCalendarDays('2026-08-10', 7)).toBe('2026-08-17');
  });

  it('subtracts days across a month boundary', () => {
    expect(addCalendarDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('adds across a year boundary', () => {
    expect(addCalendarDays('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('crossing the spring-forward transition still lands 7 calendar days later', () => {
    // Mon Mar 2 2026 + 7 days is Mon Mar 9 2026, independent of the DST
    // transition that falls on Mar 8 in America/Chicago: this function has
    // no notion of any timezone at all.
    expect(addCalendarDays('2026-03-02', 7)).toBe('2026-03-09');
  });

  it('crossing the fall-back transition still lands 7 calendar days later', () => {
    expect(addCalendarDays('2026-10-26', 7)).toBe('2026-11-02');
  });

  it('handles a leap-year February correctly', () => {
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2024-02-29', 1)).toBe('2024-03-01');
  });
});

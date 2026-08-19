// Tests for the canonical "what is the Monday of this week" resolver and
// the submission-policy offsets built on top of it. See COR-1: this used to
// be reimplemented three different ways across the app (this file, plus
// dateUtils.ts and plannerUtils.ts, which now both delegate here).
//
// All expectations are exact UTC instants, computed by hand from known
// America/Chicago UTC offsets (CST = UTC-6, CDT = UTC-5), so these tests
// are not sensitive to whatever timezone the machine running them happens
// to be in. That is deliberate and load-bearing: this suite must pass
// under any host TZ, not just America/Chicago or UTC. CI runs it under
// TZ=UTC, TZ=America/Chicago, TZ=Pacific/Kiritimati, and
// TZ=America/Los_Angeles.

import { describe, it, expect } from 'vitest';
import {
  resolveMonday,
  resolveNextMonday,
  getSubmissionPolicy,
  getPolicyOffsetsForLocation,
  DEFAULT_POLICY_OFFSETS,
} from './submissionPolicy';

const CHICAGO = 'America/Chicago';

describe('resolveMonday', () => {
  it('a normal midweek Wednesday resolves to that week\'s Monday 00:00 CST', () => {
    // Wed Aug 12 2026, 20:00 UTC = 3:00pm CDT. Chicago is on CDT in August.
    const now = new Date('2026-08-12T20:00:00Z');
    const monday = resolveMonday(now, CHICAGO);
    // Mon Aug 10 2026 00:00 CDT (UTC-5) = 05:00 UTC.
    expect(monday.toISOString()).toBe('2026-08-10T05:00:00.000Z');
  });

  it('Sunday resolves to the Monday six days earlier, not the following Monday', () => {
    const now = new Date('2026-08-16T12:00:00Z'); // Sunday
    const monday = resolveMonday(now, CHICAGO);
    expect(monday.toISOString()).toBe('2026-08-10T05:00:00.000Z');
  });

  it('Monday itself resolves to its own midnight', () => {
    const now = new Date('2026-08-10T18:00:00Z'); // Monday afternoon CDT
    const monday = resolveMonday(now, CHICAGO);
    expect(monday.toISOString()).toBe('2026-08-10T05:00:00.000Z');
  });

  it('resolves the correct Monday across a spring-forward DST transition (America/Chicago, Mar 8 2026)', () => {
    // Sunday Mar 8 2026, 15:00 UTC = 10:00am CDT (after the 2am->3am jump).
    // That week's Monday (Mar 2) was still on CST, before the transition.
    const now = new Date('2026-03-08T15:00:00Z');
    const monday = resolveMonday(now, CHICAGO);
    // Mon Mar 2 2026 00:00 CST (UTC-6) = 06:00 UTC.
    expect(monday.toISOString()).toBe('2026-03-02T06:00:00.000Z');
  });

  it('resolves the correct Monday across a fall-back DST transition (America/Chicago, Nov 1 2026)', () => {
    // Sunday Nov 1 2026, 12:00 UTC = 6:00am CST (after the 2am->1am fall back
    // that morning). That week's Monday (Oct 26) was still on CDT.
    const now = new Date('2026-11-01T12:00:00Z');
    const monday = resolveMonday(now, CHICAGO);
    // Mon Oct 26 2026 00:00 CDT (UTC-5) = 05:00 UTC.
    expect(monday.toISOString()).toBe('2026-10-26T05:00:00.000Z');
  });

  it('is pure: the same inputs always produce the same instant', () => {
    const now = new Date('2026-08-12T20:00:00Z');
    expect(resolveMonday(now, CHICAGO).toISOString()).toBe(resolveMonday(now, CHICAGO).toISOString());
  });
});

describe('resolveNextMonday', () => {
  it('advances a full week when "now" is already Monday (never returns today)', () => {
    const now = new Date('2026-08-10T18:00:00Z'); // Monday afternoon CDT
    const next = resolveNextMonday(now, CHICAGO);
    expect(next.toISOString()).toBe('2026-08-17T05:00:00.000Z');
  });

  it('on a Sunday, returns tomorrow (the nearest upcoming Monday)', () => {
    const now = new Date('2026-08-16T12:00:00Z'); // Sunday
    const next = resolveNextMonday(now, CHICAGO);
    expect(next.toISOString()).toBe('2026-08-17T05:00:00.000Z');
  });

  it('on a midweek day, returns next week\'s Monday, not this week\'s (already-past) Monday', () => {
    const now = new Date('2026-08-12T20:00:00Z'); // Wednesday
    const next = resolveNextMonday(now, CHICAGO);
    expect(next.toISOString()).toBe('2026-08-17T05:00:00.000Z');
  });
});

describe('getSubmissionPolicy — each policy offset', () => {
  // Wed Aug 12 2026 in Chicago (CDT, UTC-5). Week is Mon Aug 10 - Sun Aug 16.
  const now = new Date('2026-08-12T20:00:00Z');
  const policy = getSubmissionPolicy(now, CHICAGO);

  it('mondayZ: Monday 00:00 CDT', () => {
    expect(policy.mondayZ.toISOString()).toBe('2026-08-10T05:00:00.000Z');
  });

  it('checkin_open: Monday 00:01 CDT', () => {
    expect(policy.checkin_open.toISOString()).toBe('2026-08-10T05:01:00.000Z');
  });

  it('checkin_visible: Monday 06:00 CDT', () => {
    expect(policy.checkin_visible.toISOString()).toBe('2026-08-10T11:00:00.000Z');
  });

  it('confidence_due: Tuesday 14:00 CDT', () => {
    expect(policy.confidence_due.toISOString()).toBe('2026-08-11T19:00:00.000Z');
  });

  it('checkout_open: Thursday 00:01 CDT', () => {
    expect(policy.checkout_open.toISOString()).toBe('2026-08-13T05:01:00.000Z');
  });

  it('performance_due: Friday 17:00 CDT', () => {
    expect(policy.performance_due.toISOString()).toBe('2026-08-14T22:00:00.000Z');
  });

  it('week_end: Sunday 23:59:59 CDT', () => {
    expect(policy.week_end.toISOString()).toBe('2026-08-17T04:59:59.000Z');
  });

  it('per-location offsets override only confidence_due and performance_due', () => {
    const offsets = getPolicyOffsetsForLocation({
      conf_due_day: 2, // Wednesday
      conf_due_time: '10:00:00',
      perf_due_day: 5, // Saturday
      perf_due_time: '12:00:00',
    });
    const overridden = getSubmissionPolicy(now, CHICAGO, offsets);

    expect(overridden.confidence_due.toISOString()).toBe('2026-08-12T15:00:00.000Z'); // Wed 10:00 CDT
    expect(overridden.performance_due.toISOString()).toBe('2026-08-15T17:00:00.000Z'); // Sat 12:00 CDT
    // Untouched offsets still match the defaults.
    expect(overridden.mondayZ.toISOString()).toBe(policy.mondayZ.toISOString());
    expect(overridden.checkin_open.toISOString()).toBe(policy.checkin_open.toISOString());
    expect(overridden.week_end.toISOString()).toBe(policy.week_end.toISOString());
  });

  it('null location overrides fall back to the defaults', () => {
    const offsets = getPolicyOffsetsForLocation({
      conf_due_day: null,
      conf_due_time: null,
      perf_due_day: null,
      perf_due_time: null,
    });
    expect(offsets).toEqual(DEFAULT_POLICY_OFFSETS);
  });
});

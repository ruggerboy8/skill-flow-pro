// Tests for getLocationWeekContext — the function that figures out, for a
// given location and moment in time, "what week and cycle is it right now?"
//
// Some vocabulary, for anyone reading this without the Supabase/date-fns
// context (see docs/archive/glossary.md for the full definitions):
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
import {
  getLocationWeekContext,
  assembleWeek,
  resolveOrgIdForGroup,
  resolveOrgTimezoneById,
  resolveOrgTimezoneForGroup,
} from './locationState';
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

// ---------------------------------------------------------------------------
// ASG-1 Fix 2 — the shared org-canonical-timezone resolvers. These are the
// building blocks every participant surface (ThisWeekPanel, ConfidenceWizard,
// PerformanceWizard, TeamWeeklyFocus) now calls instead of re-deriving the
// location -> practice_groups.organization_id -> organizations.timezone
// chain itself, so there's one definition of "the org's canonical week" to
// get right. See docs/specs/asg-1-weekly-assignment-visibility.md, Fix 2.
// ---------------------------------------------------------------------------

describe('resolveOrgIdForGroup', () => {
  it("resolves a practice group's parent organization id", async () => {
    queueTable('practice_groups', { data: { organization_id: 'org-1' }, error: null });

    await expect(resolveOrgIdForGroup('group-1')).resolves.toBe('org-1');
  });

  it('returns null when the group has no row', async () => {
    queueTable('practice_groups', { data: null, error: null });

    await expect(resolveOrgIdForGroup('missing-group')).resolves.toBeNull();
  });
});

describe('resolveOrgTimezoneById', () => {
  it("returns the organization's timezone", async () => {
    queueTable('organizations', { data: { timezone: 'America/Denver' }, error: null });

    await expect(resolveOrgTimezoneById('org-1')).resolves.toBe('America/Denver');
  });

  it('falls back to America/Chicago when the row has no timezone set', async () => {
    queueTable('organizations', { data: { timezone: null }, error: null });

    await expect(resolveOrgTimezoneById('org-1')).resolves.toBe('America/Chicago');
  });

  it('falls back to America/Chicago on a query error instead of throwing', async () => {
    queueTable('organizations', { data: null, error: { message: 'column does not exist yet' } });

    await expect(resolveOrgTimezoneById('org-1')).resolves.toBe('America/Chicago');
  });
});

describe('resolveOrgTimezoneForGroup', () => {
  it('chains group -> org -> timezone', async () => {
    queueTable('practice_groups', { data: { organization_id: 'org-1' }, error: null });
    queueTable('organizations', { data: { timezone: 'Europe/London' }, error: null });

    await expect(resolveOrgTimezoneForGroup('group-1')).resolves.toEqual({
      orgId: 'org-1',
      timezone: 'Europe/London',
    });
  });

  it('falls back to America/Chicago with no orgId when groupId is missing', async () => {
    await expect(resolveOrgTimezoneForGroup(null)).resolves.toEqual({
      orgId: null,
      timezone: 'America/Chicago',
    });
    await expect(resolveOrgTimezoneForGroup(undefined)).resolves.toEqual({
      orgId: null,
      timezone: 'America/Chicago',
    });
  });

  it('falls back to America/Chicago with no orgId when the group has no organization', async () => {
    queueTable('practice_groups', { data: null, error: null });

    await expect(resolveOrgTimezoneForGroup('group-1')).resolves.toEqual({
      orgId: null,
      timezone: 'America/Chicago',
    });
  });
});

// ---------------------------------------------------------------------------
// ASG-1 Fix 2 — assembleWeek's returned weekStartDate. weekly_assignments
// rows are org-level, so the week key has to be the SAME org-canonical
// Monday regardless of which location's staff member is looking at it.
// ---------------------------------------------------------------------------

describe('assembleWeek — canonical weekStartDate', () => {
  it('resolves the org-canonical Monday, not the location timezone Monday, during the Sunday-night rollover window', async () => {
    // Mon Aug 17 2026, 04:30 UTC = Mon 00:30 EDT (New York — already turned
    // over to the new week) but Sun 23:30 CDT (Chicago — has not). Same
    // rollover instant as submissionPolicy.test.ts's getAssignmentWeekMondayStr
    // rollover case. If assembleWeek used this location's OWN timezone (the
    // pre-fix behavior) the result would be '2026-08-17'; the org's
    // canonical timezone (America/Chicago) gives '2026-08-10'.
    const rolloverInstant = new Date('2026-08-17T04:30:00Z');

    queueTable('locations', {
      data: {
        timezone: 'America/New_York',
        group_id: 'group-1',
        conf_due_day: null,
        conf_due_time: null,
        perf_due_day: null,
        perf_due_time: null,
      },
      error: null,
    });
    queueTable('practice_groups', { data: { organization_id: 'org-1' }, error: null });
    queueTable('organizations', { data: { timezone: 'America/Chicago' }, error: null });
    queueTable('weekly_assignments', { data: [], error: null });

    const result = await assembleWeek({
      userId: 'user-1',
      roleId: 2,
      locationId: 'loc-1',
      cycleNumber: 1,
      weekInCycle: 1,
      simOverrides: { enabled: true, nowISO: rolloverInstant.toISOString() },
    });

    expect(result).toEqual({ assignments: [], weekStartDate: '2026-08-10' });

    const orgQuery = getTableCalls('organizations')[0];
    expect(orgQuery.filters).toContainEqual({ op: 'eq', args: ['id', 'org-1'] });
  });

  it('returns weekStartDate: null when the location cannot be resolved', async () => {
    queueTable('locations', { data: null, error: null });

    const result = await assembleWeek({
      userId: 'user-1',
      roleId: 1,
      locationId: 'missing-loc',
      cycleNumber: 1,
      weekInCycle: 1,
    });

    expect(result).toEqual({ assignments: [], weekStartDate: null });
  });

  it('returns weekStartDate: null when the location has no resolvable organization', async () => {
    queueTable('locations', {
      data: { timezone: 'UTC', group_id: 'group-1' },
      error: null,
    });
    queueTable('practice_groups', { data: null, error: null });

    const result = await assembleWeek({
      userId: 'user-1',
      roleId: 1,
      locationId: 'loc-1',
      cycleNumber: 1,
      weekInCycle: 1,
    });

    expect(result).toEqual({ assignments: [], weekStartDate: null });
  });
});

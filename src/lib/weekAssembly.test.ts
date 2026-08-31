// Tests for assembleCurrentWeek's ASG-1 Fix 2 addition: it now forwards the
// canonical org-timezone `weekStartDate` that locationState.assembleWeek
// resolves internally, so callers (ThisWeekPanel's "Week of" label and
// excused_weeks lookup) can key off the SAME week the assignments actually
// loaded under instead of recomputing a Monday from the location's own
// timezone. See docs/specs/asg-1-weekly-assignment-visibility.md, Fix 2.

import { describe, it, expect } from 'vitest';
import { assembleCurrentWeek } from './weekAssembly';
import { queueTable } from '@/test/supabaseMock';

function makeLocationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loc-1',
    name: 'Test Location',
    program_start_date: '2026-01-05',
    cycle_length_weeks: 6,
    timezone: 'America/New_York',
    group_id: 'group-1',
    conf_due_day: null,
    conf_due_time: null,
    perf_due_day: null,
    perf_due_time: null,
    ...overrides,
  };
}

describe('assembleCurrentWeek — forwards the canonical weekStartDate', () => {
  it("resolves the org-canonical Monday, not this location's own timezone Monday, during the Sunday-night rollover window", async () => {
    // Same rollover instant as locationState.test.ts / submissionPolicy.test.ts:
    // New York has already turned over to the new week; Chicago (the org's
    // canonical timezone here) has not.
    const rolloverInstant = new Date('2026-08-17T04:30:00Z');

    // assembleCurrentWeek makes two separate `locations` fetches under the
    // hood: one via getLocationWeekContext (site-centric week/cycle math),
    // one via locationState.assembleWeek (the org-canonical lookup key).
    // The mock's queue is FIFO per table, so both are queued in call order.
    queueTable('locations', { data: makeLocationRow(), error: null });
    queueTable('locations', { data: makeLocationRow(), error: null });
    queueTable('practice_groups', { data: { organization_id: 'org-1' }, error: null });
    queueTable('organizations', { data: { timezone: 'America/Chicago' }, error: null });
    queueTable('weekly_assignments', { data: [], error: null });

    const result = await assembleCurrentWeek(
      'user-1',
      { id: 'staff-1', role_id: 2, primary_location_id: 'loc-1' },
      { enabled: true, nowISO: rolloverInstant.toISOString() }
    );

    expect(result.assignments).toEqual([]);
    expect(result.weekStartDate).toBe('2026-08-10');
  });

  it('returns weekStartDate: null (and an empty assignment list) instead of throwing when the location cannot be resolved', async () => {
    // getLocationWeekContext throws "Location not found"; assembleCurrentWeek's
    // own try/catch turns that into the safe fallback shape.
    queueTable('locations', { data: null, error: null });

    const result = await assembleCurrentWeek('user-1', {
      id: 'staff-1',
      role_id: 2,
      primary_location_id: 'loc-1',
    });

    expect(result).toEqual({
      assignments: [],
      cycleNumber: 1,
      weekInCycle: 1,
      weekStartDate: null,
    });
  });
});

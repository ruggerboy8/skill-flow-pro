// TST-3 tests for computeWeekStateCore — the pure core of the daily CTA
// state machine extracted out of computeWeekState (locationState.ts). This
// decides which button a staff member sees: submit confidence, late,
// waiting for Thursday, submit performance, done, or no assignments.
//
// Each test builds a plain WeekStateFacts snapshot (no Supabase, no async)
// and checks the returned CTA state and, where relevant, the deadline it
// reports. Table-driven where the cases are uniform.

import { describe, it, expect } from 'vitest';
import { computeWeekStateCore, type WeekStateFacts, type WeekStateAnchors } from './weekStateCore';

// A single week's anchors: Monday 2026-01-05.
//   Mon 00:00 — week starts
//   Tue 14:00 — confidence (check-in) due
//   Thu 00:01 — performance (check-out) opens
//   Fri 17:00 — performance due
const ANCHORS: WeekStateAnchors = {
  checkin_due: new Date('2026-01-06T14:00:00Z'),
  checkout_open: new Date('2026-01-08T00:01:00Z'),
  checkout_due: new Date('2026-01-09T17:00:00Z'),
};

function baseFacts(overrides: Partial<WeekStateFacts> = {}): WeekStateFacts {
  return {
    now: new Date('2026-01-05T10:00:00Z'),
    anchors: ANCHORS,
    eligible: true,
    hasAssignments: true,
    confComplete: false,
    perfComplete: false,
    backlogCount: 0,
    selectionPending: false,
    ...overrides,
  };
}

describe('computeWeekStateCore — gates before the time-based machine', () => {
  it('returns onboarding when the staff member is not yet eligible', () => {
    const result = computeWeekStateCore(
      baseFacts({ eligible: false, onboardingWeeksLeft: 2 })
    );
    expect(result.state).toBe('onboarding');
    expect(result.onboardingWeeksLeft).toBe(2);
    expect(result.backlogCount).toBe(0);
    expect(result.selectionPending).toBe(false);
  });

  it('defaults onboardingWeeksLeft to 0 when not supplied', () => {
    const result = computeWeekStateCore(baseFacts({ eligible: false }));
    expect(result.onboardingWeeksLeft).toBe(0);
  });

  it('returns no_assignments when there are no assignments for the week, regardless of time', () => {
    const result = computeWeekStateCore(
      baseFacts({ hasAssignments: false, now: new Date('2026-01-08T12:00:00Z') })
    );
    expect(result).toEqual({
      state: 'no_assignments',
      backlogCount: 0,
      selectionPending: false,
    });
  });

  it('eligibility is checked before assignment existence', () => {
    // Both gates would fire; eligibility must win, matching the original
    // inline order (eligibility checked, then assignments fetched).
    const result = computeWeekStateCore(
      baseFacts({ eligible: false, hasAssignments: false, onboardingWeeksLeft: 1 })
    );
    expect(result.state).toBe('onboarding');
  });
});

describe('computeWeekStateCore — each reachable CTA state', () => {
  it('done: both confidence and performance complete, any time in the week', () => {
    const result = computeWeekStateCore(
      baseFacts({ confComplete: true, perfComplete: true, now: new Date('2026-01-05T10:00:00Z') })
    );
    expect(result.state).toBe('done');
    expect(result.nextAction).toBeUndefined();
  });

  it('can_checkin: before the confidence deadline, confidence not yet submitted', () => {
    const result = computeWeekStateCore(
      baseFacts({ now: new Date('2026-01-05T10:00:00Z'), confComplete: false })
    );
    expect(result.state).toBe('can_checkin');
    expect(result.nextAction).toBe('Submit confidence');
    expect(result.deadlineAt).toEqual(ANCHORS.checkin_due);
  });

  it('wait_for_thu: confidence submitted early, before the confidence deadline', () => {
    const result = computeWeekStateCore(
      baseFacts({ now: new Date('2026-01-05T10:00:00Z'), confComplete: true, perfComplete: false })
    );
    expect(result.state).toBe('wait_for_thu');
    expect(result.nextAction).toBe('Performance opens Thursday');
  });

  it('wait_for_thu: confidence submitted, mid-week after the confidence deadline but before performance opens', () => {
    // Reaches the "confComplete && now < checkout_open" fallback branch, a
    // distinct code path from the pre-Tuesday-noon wait_for_thu above.
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-07T09:00:00Z'), // Wednesday
        confComplete: true,
        perfComplete: false,
      })
    );
    expect(result.state).toBe('wait_for_thu');
  });

  it('missed_checkin: confidence still missing after the confidence deadline, before performance opens', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-07T09:00:00Z'), // Wednesday
        confComplete: false,
      })
    );
    expect(result.state).toBe('missed_checkin');
    expect(result.nextAction).toBe('Submit confidence (late)');
  });

  it('missed_checkin: confidence still missing during the performance window', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-08T10:00:00Z'), // Thursday, inside checkout window
        confComplete: false,
      })
    );
    expect(result.state).toBe('missed_checkin');
    expect(result.nextAction).toBe('Submit confidence (late)');
    expect(result.deadlineAt).toEqual(ANCHORS.checkout_due);
  });

  it('can_checkout: confidence complete, performance not yet submitted, inside the performance window', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-08T10:00:00Z'), // Thursday
        confComplete: true,
        perfComplete: false,
      })
    );
    expect(result.state).toBe('can_checkout');
    expect(result.nextAction).toBe('Submit performance');
    expect(result.deadlineAt).toEqual(ANCHORS.checkout_due);
  });

  it('missed_checkout: performance still missing after the performance deadline', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-10T08:00:00Z'), // Saturday
        confComplete: true,
        perfComplete: false,
      })
    );
    expect(result.state).toBe('missed_checkout');
    expect(result.nextAction).toBe('Submit performance (late)');
  });

  it('falls back to no_assignments for a data state no branch above claims (perf in, confidence not, week over)', () => {
    // Inconsistent data (performance recorded without confidence) that the
    // pure state machine doesn't special-case — pinning the actual
    // fallback so a future change to this order is noticed.
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-10T08:00:00Z'), // Saturday, after everything closes
        confComplete: false,
        perfComplete: true,
      })
    );
    expect(result.state).toBe('no_assignments');
  });
});

describe('computeWeekStateCore — performance deadline boundary', () => {
  const confDone = { confComplete: true, perfComplete: false };

  it('at exactly the performance deadline, still counts as on time (can_checkout)', () => {
    const result = computeWeekStateCore(
      baseFacts({ now: ANCHORS.checkout_due, ...confDone })
    );
    expect(result.state).toBe('can_checkout');
  });

  it('one millisecond after the performance deadline, counts as late (missed_checkout)', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date(ANCHORS.checkout_due.getTime() + 1),
        ...confDone,
      })
    );
    expect(result.state).toBe('missed_checkout');
  });
});

describe('computeWeekStateCore — confidence deadline boundary', () => {
  it('at exactly the confidence deadline, still counts as on time (can_checkin)', () => {
    const result = computeWeekStateCore(
      baseFacts({ now: ANCHORS.checkin_due, confComplete: false })
    );
    expect(result.state).toBe('can_checkin');
  });

  it('one millisecond after the confidence deadline, counts as late (missed_checkin)', () => {
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date(ANCHORS.checkin_due.getTime() + 1),
        confComplete: false,
      })
    );
    expect(result.state).toBe('missed_checkin');
  });
});

describe('computeWeekStateCore — carries backlog/selection/lastActivity through unchanged', () => {
  it('passes backlogCount, selectionPending, and lastActivity through to non-gate states', () => {
    const lastActivity = { kind: 'confidence' as const, at: new Date('2026-01-05T09:00:00Z') };
    const result = computeWeekStateCore(
      baseFacts({
        now: new Date('2026-01-05T10:00:00Z'),
        confComplete: false,
        backlogCount: 3,
        selectionPending: true,
        lastActivity,
      })
    );
    expect(result.backlogCount).toBe(3);
    expect(result.selectionPending).toBe(true);
    expect(result.lastActivity).toEqual(lastActivity);
  });
});

import { describe, it, expect } from 'vitest';
import { calculateMissingCounts, calculateLocationStats, calculateDistinctMissedCount, calculateDueSubmissionTotals, calculateExcuseAdjustedLocationStats, type SubmissionGates } from './submissionStatus';
import type { StaffWeekSummary } from '@/types/coachV2';

// DASH-5: location-level counting is people-based. The fields that matter
// to these helpers are required_count (the person's real workload from
// weekly_assignments) and conf/perf_required_done (scores submitted on
// required moves). A person is done only when done >= required; a person
// with required_count 0 owes nothing and is invisible to every count.
function week(overrides: Partial<StaffWeekSummary> = {}): StaffWeekSummary {
  return {
    staff_id: 's1',
    staff_name: 'Staffer',
    staff_email: 's1@example.com',
    user_id: 'u1',
    role_id: 1,
    role_name: 'RDA',
    location_id: 'loc-1',
    location_name: 'Main St',
    group_id: 'group-1',
    group_name: 'North',
    week_of: '2026-08-10',
    assignment_count: 2,
    conf_count: 0,
    perf_count: 0,
    required_count: 2,
    conf_required_done: 0,
    perf_required_done: 0,
    has_any_late: false,
    is_complete: false,
    scores: [],
    ...overrides,
  };
}

const done = { conf_required_done: 2, perf_required_done: 2 };
const confDoneOnly = { conf_required_done: 2, perf_required_done: 0 };

const noGates: SubmissionGates = {
  isPastConfidenceDeadline: false,
  isPastPerformanceDeadline: false,
  isPerformanceOpen: false,
};

describe('calculateMissingCounts', () => {
  it('counts nobody as missing before the confidence deadline has passed', () => {
    const staff = [week()];
    const result = calculateMissingCounts(staff, { ...noGates });
    expect(result.missingConfCount).toBe(0);
    expect(result.missingPerfCount).toBe(0);
  });

  it('counts a staff member as missing confidence once the confidence deadline has passed', () => {
    const staff = [week()];
    const result = calculateMissingCounts(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.missingConfCount).toBe(1);
  });

  it('does not count a staff member who checked in fully, even past deadline', () => {
    const staff = [week(confDoneOnly)];
    const result = calculateMissingCounts(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.missingConfCount).toBe(0);
  });

  it('counts a PARTIAL check-in as missing - the task is all required moves, not some (DASH-5)', () => {
    const staff = [week({ conf_required_done: 1, required_count: 3 })];
    const result = calculateMissingCounts(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.missingConfCount).toBe(1);
  });

  it('never counts a person with no published assignments as missing (DASH-5)', () => {
    const staff = [week({ required_count: 0 })];
    const result = calculateMissingCounts(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.missingConfCount).toBe(0);
    expect(result.missingPerfCount).toBe(0);
  });

  it('counts performance missing only once the performance deadline has passed', () => {
    const staff = [week()];
    const before = calculateMissingCounts(staff, { ...noGates, isPastPerformanceDeadline: false });
    const after = calculateMissingCounts(staff, { ...noGates, isPastPerformanceDeadline: true });
    expect(before.missingPerfCount).toBe(0);
    expect(after.missingPerfCount).toBe(1);
  });
});

describe('calculateLocationStats', () => {
  it('rate is 100% before any deadline has passed, even with zero submissions (nothing is due yet)', () => {
    const staff = [week()];
    const result = calculateLocationStats(staff, { ...noGates });
    expect(result.submissionRate).toBe(100);
    expect(result.missingConfCount).toBe(0);
    expect(result.pendingConfCount).toBe(1);
  });

  it('rate drops to reflect missed confidence the moment the confidence deadline passes', () => {
    const staff = [week()];
    const result = calculateLocationStats(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    // Only confidence counts toward the denominator so far: 0 of 1 people in.
    expect(result.submissionRate).toBe(0);
    expect(result.missingConfCount).toBe(1);
    expect(result.pendingConfCount).toBe(0); // no longer "pending" once past deadline, it's missing
  });

  it('a full house (everyone submitted on time) shows 100% after both deadlines pass', () => {
    const staff = [
      week(done),
      week({ staff_id: 's2', ...done }),
    ];
    const result = calculateLocationStats(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.submissionRate).toBe(100);
    expect(result.missingConfCount).toBe(0);
    expect(result.missingPerfCount).toBe(0);
  });

  it('combines check-in and check-out people into one blended rate once both deadlines have passed', () => {
    // 2 staff: s1 fully checked in AND out, s2 checked in but not out.
    // People-due = 2 (conf) + 2 (perf) = 4. Done = 2 + 1 = 3. Rate = 75%.
    const staff = [
      week(done),
      week({ staff_id: 's2', ...confDoneOnly }),
    ];
    const result = calculateLocationStats(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.submissionRate).toBe(75);
    expect(result.missingPerfCount).toBe(1);
  });

  it('a partial check-in counts as not checked in, everywhere (DASH-5)', () => {
    const staff = [week({ required_count: 3, conf_required_done: 2 })];
    const result = calculateLocationStats(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.submissionRate).toBe(0);
    expect(result.confSubmittedCount).toBe(0);
    expect(result.confExpectedCount).toBe(1);
  });

  it('people with no published assignments are excluded from every denominator (DASH-5)', () => {
    const staff = [
      week(confDoneOnly),
      week({ staff_id: 's2', required_count: 0 }),
    ];
    const result = calculateLocationStats(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.staffCount).toBe(2);
    expect(result.owedStaffCount).toBe(1);
    expect(result.submissionRate).toBe(100);
    expect(result.confExpectedCount).toBe(1);
    expect(result.missingConfCount).toBe(0);
  });

  it('a location where nobody owes anything reads 100% with owedStaffCount 0, never as 0% (DASH-5)', () => {
    const staff = [
      week({ required_count: 0 }),
      week({ staff_id: 's2', required_count: 0 }),
    ];
    const result = calculateLocationStats(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.owedStaffCount).toBe(0);
    expect(result.submissionRate).toBe(100);
    expect(result.missingConfCount).toBe(0);
    expect(result.distinctMissedCount).toBe(0);
  });

  it('averages confidence and performance scores only over scores that were actually entered', () => {
    const staff = [
      week({
        scores: [
          { confidence_score: 3, performance_score: null } as any,
          { confidence_score: null, performance_score: 4 } as any,
        ],
      }),
    ];
    const result = calculateLocationStats(staff, { ...noGates });
    expect(result.avgConfidence).toBe(3);
    expect(result.avgPerformance).toBe(4);
  });
});

describe('calculateDistinctMissedCount', () => {
  const bothDeadlinesPassed: SubmissionGates = {
    isPastConfidenceDeadline: true,
    isPastPerformanceDeadline: true,
    isPerformanceOpen: true,
  };

  it('counts a person who missed both confidence and performance once, not twice (DASH-1a QA fix)', () => {
    // 4-person location, both deadlines passed, 2 people miss both, 2 submit everything.
    // Distinct people missed = 2, not missingConfCount + missingPerfCount = 4.
    const staff = [
      week({ staff_id: 's1' }),
      week({ staff_id: 's2' }),
      week({ staff_id: 's3', ...done }),
      week({ staff_id: 's4', ...done }),
    ];
    const result = calculateDistinctMissedCount(staff, bothDeadlinesPassed);
    expect(result).toBe(2);

    const locStats = calculateLocationStats(staff, bothDeadlinesPassed);
    expect(locStats.missingConfCount).toBe(2);
    expect(locStats.missingPerfCount).toBe(2);
    expect(locStats.distinctMissedCount).toBe(2);
  });

  it('counts someone missing only one metric once', () => {
    const staff = [week(confDoneOnly)];
    expect(calculateDistinctMissedCount(staff, bothDeadlinesPassed)).toBe(1);
  });

  it('does not count anyone before their deadline has passed', () => {
    const staff = [week()];
    expect(calculateDistinctMissedCount(staff, {
      isPastConfidenceDeadline: false,
      isPastPerformanceDeadline: false,
      isPerformanceOpen: false,
    })).toBe(0);
  });

  it('is 0 when everyone submitted everything', () => {
    const staff = [
      week({ staff_id: 's1', ...done }),
      week({ staff_id: 's2', ...done }),
    ];
    expect(calculateDistinctMissedCount(staff, bothDeadlinesPassed)).toBe(0);
  });

  it('never counts a person who owes nothing (DASH-5)', () => {
    const staff = [week({ required_count: 0 })];
    expect(calculateDistinctMissedCount(staff, bothDeadlinesPassed)).toBe(0);
  });
});

describe('calculateDueSubmissionTotals', () => {
  it('counts conf only once its deadline has passed, perf only once its deadline has passed', () => {
    // One person, checked in fully but not checked out.
    const staff = [week(confDoneOnly)];

    const beforeEither = calculateDueSubmissionTotals(staff, {
      isPastConfidenceDeadline: false,
      isPastPerformanceDeadline: false,
      isPerformanceOpen: false,
    });
    expect(beforeEither).toEqual({ confSubmitted: 0, confExpected: 0, perfSubmitted: 0, perfExpected: 0 });

    const confOnly = calculateDueSubmissionTotals(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: false,
      isPerformanceOpen: false,
    });
    expect(confOnly).toEqual({ confSubmitted: 1, confExpected: 1, perfSubmitted: 0, perfExpected: 0 });

    const both = calculateDueSubmissionTotals(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(both).toEqual({ confSubmitted: 1, confExpected: 1, perfSubmitted: 0, perfExpected: 1 });
  });

  it('excludes a not-yet-due location entirely from the org total, not as a 0-of-N drag (P1 Codex fix)', () => {
    // Location A: conf deadline passed, 5 people, 3 fully in (a4 is partial - not in).
    const locationA = [
      week({ staff_id: 'a1', ...confDoneOnly }),
      week({ staff_id: 'a2', ...confDoneOnly }),
      week({ staff_id: 'a3', ...confDoneOnly }),
      week({ staff_id: 'a4', conf_required_done: 1 }),
      week({ staff_id: 'a5' }),
    ];
    const gatesA: SubmissionGates = { isPastConfidenceDeadline: true, isPastPerformanceDeadline: false, isPerformanceOpen: false };

    // Location B: conf deadline NOT passed yet, 5 people, 0 in so far.
    const locationB = ['b1', 'b2', 'b3', 'b4', 'b5'].map(id => week({ staff_id: id }));
    const gatesB: SubmissionGates = { isPastConfidenceDeadline: false, isPastPerformanceDeadline: false, isPerformanceOpen: false };

    const dueA = calculateDueSubmissionTotals(locationA, gatesA);
    const dueB = calculateDueSubmissionTotals(locationB, gatesB);

    expect(dueA).toEqual({ confSubmitted: 3, confExpected: 5, perfSubmitted: 0, perfExpected: 0 });
    expect(dueB).toEqual({ confSubmitted: 0, confExpected: 0, perfSubmitted: 0, perfExpected: 0 });

    // Pooled org total reflects only the due location: 3/5 = 60%, not
    // (3+0)/(5+5) = 30% from summing B's raw 0-of-5 in as if it were owed.
    const orgConfSubmitted = dueA.confSubmitted + dueB.confSubmitted;
    const orgConfExpected = dueA.confExpected + dueB.confExpected;
    expect((orgConfSubmitted / orgConfExpected) * 100).toBe(60);
  });
});

describe('calculateExcuseAdjustedLocationStats', () => {
  const bothPastGates: SubmissionGates = {
    isPastConfidenceDeadline: true,
    isPastPerformanceDeadline: true,
    isPerformanceOpen: true,
  };
  const noExcuse = { isConfExcused: false, isPerfExcused: false };

  it('matches calculateLocationStats exactly when nothing is excused', () => {
    const staff = [
      week({ conf_required_done: 1 }),
      week({ staff_id: 's2', user_id: 'u2', ...done }),
    ];
    const raw = calculateLocationStats(staff, bothPastGates);
    const adjusted = calculateExcuseAdjustedLocationStats(staff, bothPastGates, noExcuse);
    expect(adjusted.submissionRate).toBe(raw.submissionRate);
    expect(adjusted.missingConfCount).toBe(raw.missingConfCount);
    expect(adjusted.missingPerfCount).toBe(raw.missingPerfCount);
    expect(adjusted.pendingConfCount).toBe(raw.pendingConfCount);
    expect(adjusted.distinctMissedCount).toBe(raw.distinctMissedCount);
    expect(adjusted.effectiveGates).toEqual(bothPastGates);
  });

  it('zeroes missing and pending confidence when confidence is excused', () => {
    const staff = [week({ perf_required_done: 2 })];
    const adjusted = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: true,
      isPerfExcused: false,
    });
    expect(adjusted.missingConfCount).toBe(0);
    expect(adjusted.pendingConfCount).toBe(0);
    expect(adjusted.effectiveGates.isPastConfidenceDeadline).toBe(false);
    expect(adjusted.effectiveGates.isPastPerformanceDeadline).toBe(true);
  });

  it('zeroes missing performance when performance is excused', () => {
    const staff = [week(confDoneOnly)];
    const adjusted = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: false,
      isPerfExcused: true,
    });
    expect(adjusted.missingPerfCount).toBe(0);
    expect(adjusted.effectiveGates.isPastPerformanceDeadline).toBe(false);
  });

  it('forces the rate to 100 only when both metrics are excused', () => {
    const staff = [week()];
    const fully = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: true,
      isPerfExcused: true,
    });
    expect(fully.submissionRate).toBe(100);

    const confOnly = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: true,
      isPerfExcused: false,
    });
    expect(confOnly.submissionRate).toBe(0);
  });

  it('excludes an excused metric from the distinct-missed count', () => {
    // Missing conf only; conf excused -> not counted as missed at all
    const staff = [week({ perf_required_done: 2 })];
    const adjusted = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: true,
      isPerfExcused: false,
    });
    expect(adjusted.distinctMissedCount).toBe(0);
  });

  it('excludes an excused metric from the due submission totals', () => {
    const staff = [week({ conf_required_done: 1, perf_required_done: 2 })];
    const adjusted = calculateExcuseAdjustedLocationStats(staff, bothPastGates, {
      isConfExcused: true,
      isPerfExcused: false,
    });
    expect(adjusted.dueTotals.confExpected).toBe(0);
    expect(adjusted.dueTotals.confSubmitted).toBe(0);
    expect(adjusted.dueTotals.perfExpected).toBe(1);
    expect(adjusted.dueTotals.perfSubmitted).toBe(1);
  });
});

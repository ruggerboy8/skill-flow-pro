// TST-3: pure core of the daily CTA state machine extracted out of
// computeWeekState (src/lib/locationState.ts). No Supabase imports — this
// takes a plain-data snapshot of "the facts the DB calls currently fetch"
// (eligibility, whether assignments exist, whether confidence/performance
// are complete, the week's time anchors, and now) and returns the same
// StaffStatus the async computeWeekState returns today.
//
// computeWeekState still owns fetching staff/assignments/scores/excused
// rows from Supabase and applying sim overrides; it builds a
// WeekStateFacts snapshot from those results and delegates here for the
// actual state decision. Behavior is unchanged from the pre-extraction
// inline version.

import type { WeekState, StaffStatus } from './locationState';

/** The subset of week-anchor timestamps the state machine reads. */
export interface WeekStateAnchors {
  checkin_due: Date;
  checkout_open: Date;
  checkout_due: Date;
}

export interface WeekStateFacts {
  now: Date;
  anchors: WeekStateAnchors;
  /** isEligibleForProMoves(staff, now) */
  eligible: boolean;
  /** getOnboardingWeeksLeft(staff, now); only meaningful when !eligible. */
  onboardingWeeksLeft?: number;
  /** Whether assembleWeek() returned any assignments for this week. */
  hasAssignments: boolean;
  /** Every required slot has a confidence score (or is excused). */
  confComplete: boolean;
  /** Every required slot has a performance score (or is excused). */
  perfComplete: boolean;
  backlogCount: number;
  selectionPending: boolean;
  lastActivity?: { kind: 'confidence' | 'performance'; at: Date };
}

/**
 * Pure decision core: given today's facts, which CTA state and next action
 * should this staff member see?
 */
export function computeWeekStateCore(facts: WeekStateFacts): StaffStatus {
  const {
    now,
    anchors,
    eligible,
    onboardingWeeksLeft,
    hasAssignments,
    confComplete,
    perfComplete,
    backlogCount,
    selectionPending,
    lastActivity,
  } = facts;

  // Onboarding gate (always eligible today — isEligibleForProMoves always
  // returns true — but the branch is kept so behavior is unchanged if that
  // ever stops being a stub).
  if (!eligible) {
    return {
      state: 'onboarding',
      nextAction: `Complete onboarding`,
      backlogCount: 0,
      selectionPending: false,
      onboardingWeeksLeft: onboardingWeeksLeft ?? 0,
    };
  }

  if (!hasAssignments) {
    return {
      state: 'no_assignments',
      backlogCount: 0,
      selectionPending: false,
    };
  }

  const { checkin_due, checkout_open, checkout_due } = anchors;

  // Fully complete
  if (confComplete && perfComplete) {
    return {
      state: 'done',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Before/at Tue noon: confidence window
  if (now <= checkin_due) {
    if (!confComplete) {
      return {
        state: 'can_checkin',
        nextAction: 'Submit confidence',
        deadlineAt: checkin_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    // Conf is in, just waiting for Thu to open performance
    return {
      state: 'wait_for_thu',
      nextAction: 'Performance opens Thursday',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // After Tue noon: confidence late if missing
  if (!confComplete && now > checkin_due && now < checkout_open) {
    // Don't populate backlog until Sunday night (week officially over)
    // Backlog v2 should only be populated at the END of the week, not mid-week
    return {
      state: 'missed_checkin',
      nextAction: 'Submit confidence (late)',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Thu -> Fri window: performance period
  if (now >= checkout_open && now <= checkout_due) {
    // During performance window, confidence must be complete first
    if (!confComplete) {
      return {
        state: 'missed_checkin',
        nextAction: 'Submit confidence (late)',
        deadlineAt: checkout_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    if (!perfComplete) {
      return {
        state: 'can_checkout',
        nextAction: 'Submit performance',
        deadlineAt: checkout_due,
        backlogCount,
        selectionPending,
        lastActivity,
      };
    }
    // Performance already in, but week not marked done => (shouldn't happen unless data skew)
    return {
      state: 'done',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // After Fri due: if performance missing -> missed_checkout
  if (now > checkout_due && !perfComplete) {
    return {
      state: 'missed_checkout',
      nextAction: 'Submit performance (late)',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Fallback: if we've submitted confidence before Thu, wait for performance window
  if (confComplete && now < checkout_open) {
    return {
      state: 'wait_for_thu',
      nextAction: 'Performance opens Thursday',
      backlogCount,
      selectionPending,
      lastActivity,
    };
  }

  // Absolute fallback
  return {
    state: 'no_assignments',
    backlogCount,
    selectionPending,
    lastActivity,
  };
}

// Re-exported so tests can reference the union without importing locationState.ts.
export type { WeekState, StaffStatus };

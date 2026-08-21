import { supabase } from '@/integrations/supabase/client';
import type { SubmissionWindow } from './submissionRateCalc';

/**
 * PRF-1: shared logic for the "previous quarter" accountability rate used by
 * useOrgAccountability and useLocationAccountability. Both hooks used to
 * carry an identical, independently-copy-pasted ~60-line block (per-staff
 * RPC loop + filter + tally); this file is that logic pulled out once so it
 * can be unit tested and so the two hooks can't drift from each other.
 *
 * Note this intentionally does NOT share logic with calculateSubmissionStats
 * (submissionRateCalc.ts). That function collapses each week+metric into a
 * single pass/fail boolean. This one counts every individual assignment slot
 * (e.g. 3 confidence + 3 performance assignments in one week each count
 * separately) -- a deliberate difference the original code called out
 * ("properly tracks each individual assignment slot"), not something to
 * unify.
 */

export interface QuarterTally {
  expected: number;
  completed: number;
  onTime: number;
}

const EMPTY_TALLY: QuarterTally = { expected: 0, completed: 0, onTime: 0 };

/**
 * Tally per-slot completion from one staff member's submission windows,
 * restricted to windows that are both past-due and fall within the target
 * quarter (week_of <= quarterEndDateStr).
 */
export function tallyQuarterWindows(
  windows: SubmissionWindow[],
  quarterEndDateStr: string,
  now: Date = new Date(),
): QuarterTally {
  let expected = 0;
  let completed = 0;
  let onTime = 0;

  for (const w of windows) {
    const dueAt = new Date(w.due_at);
    if (!(dueAt <= now && w.week_of <= quarterEndDateStr)) continue;

    expected++;
    if (w.status === 'submitted') {
      completed++;
      if (w.on_time === true) onTime++;
    }
  }

  return { expected, completed, onTime };
}

/** Sums a list of per-staff tallies into one total. */
export function sumQuarterTallies(tallies: QuarterTally[]): QuarterTally {
  return tallies.reduce(
    (acc, t) => ({
      expected: acc.expected + t.expected,
      completed: acc.completed + t.completed,
      onTime: acc.onTime + t.onTime,
    }),
    { ...EMPTY_TALLY },
  );
}

/** Converts a total tally into completion/on-time percentages (0-100, rounded), or null when there's nothing expected. */
export function quarterCompletionRates(tally: QuarterTally): {
  completionRate: number | null;
  onTimeRate: number | null;
} {
  if (tally.expected === 0) {
    return { completionRate: null, onTimeRate: null };
  }
  return {
    completionRate: Math.round((tally.completed / tally.expected) * 100),
    onTimeRate: Math.round((tally.onTime / tally.expected) * 100),
  };
}

/**
 * Fetches and tallies quarter accountability across a batch of staff.
 * Still one `get_staff_submission_windows` round trip per staff member --
 * that RPC checks caller authorization per staff_id inside
 * can_current_user_view_staff() (covering self / super-admin / org coach /
 * office manager / coach_scopes-based lead), and the underlying tables'
 * RLS policies don't cover that last branch. Switching to a direct
 * `.in('staff_id', ids)` read against the view or base tables would
 * silently return incomplete data for a coach_scopes-scoped caller (e.g. a
 * lead), so that path was left alone. This is now the single implementation
 * both hooks call, instead of two copies that could drift.
 */
export async function fetchQuarterAccountability(
  staffIds: string[],
  sinceStr: string,
  quarterEndDateStr: string,
  now: Date = new Date(),
): Promise<QuarterTally> {
  const perStaffTallies: QuarterTally[] = [];

  const batchSize = 20;
  for (let i = 0; i < staffIds.length; i += batchSize) {
    const batch = staffIds.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (staffId): Promise<QuarterTally> => {
        try {
          const { data, error } = await supabase.rpc('get_staff_submission_windows', {
            p_staff_id: staffId,
            p_since: sinceStr,
          });

          if (error || !data) return { ...EMPTY_TALLY };

          return tallyQuarterWindows(data as SubmissionWindow[], quarterEndDateStr, now);
        } catch {
          return { ...EMPTY_TALLY };
        }
      }),
    );

    perStaffTallies.push(...results);
  }

  return sumQuarterTallies(perStaffTallies);
}

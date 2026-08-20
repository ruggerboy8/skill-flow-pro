// TST-3: pure week-index / cycle math extracted out of
// getLocationWeekContext (src/lib/locationState.ts). No Supabase imports,
// no dates-from-"now" defaults — every input is passed in explicitly so this
// can be tested without a database.
//
// LEGACY NOTE (John, 2026-08-19): "cycle" is a holdover from the old fixed
// 18-week onboarding program. New users now just join globally assigned pro
// moves, and cycle counting is slated for eventual removal. cycleNumber and
// weekInCycle are kept here EXACTLY as they behave today — this extraction
// does not change their semantics — but treat the cycle math below as
// pending removal, not something to build further on.

export interface WeekCycleMathInput {
  /** Number of weeks in one cycle (location.cycle_length_weeks). */
  cycleLength: number;
  /** Monday 00:00 (as a UTC instant) of the week containing "now". */
  currentMonday: Date;
  /** Monday 00:00 (as a UTC instant) of the week containing the location's program start date. */
  programStartMonday: Date;
  /**
   * True when "now" is still before this week's performance (checkout)
   * deadline, meaning staff are still finishing the *previous* week's
   * assignments. Callers compute this as `now < anchors.checkout_due`.
   */
  beforePerformanceDeadline: boolean;
}

export interface WeekCycleMathResult {
  /** 0-based week index counted from the program start Monday. */
  weekIndex: number;
  /** @deprecated legacy cycle concept, pending removal — see LEGACY NOTE above. */
  cycleNumber: number;
  /** @deprecated legacy cycle concept, pending removal — see LEGACY NOTE above. */
  weekInCycle: number;
}

/**
 * Pure port of the arithmetic that used to live inline in
 * getLocationWeekContext (locationState.ts ~lines 60-75). Behavior is
 * unchanged: same rounding, same "still on last week's assignments until
 * the performance deadline passes" adjustment, same cycle wraparound.
 */
export function computeWeekCycleMath(input: WeekCycleMathInput): WeekCycleMathResult {
  const { cycleLength, currentMonday, programStartMonday, beforePerformanceDeadline } = input;

  const daysDiff = Math.floor(
    (currentMonday.getTime() - programStartMonday.getTime()) / (1000 * 60 * 60 * 24)
  );
  let weekIndex = Math.floor(daysDiff / 7);

  // If we're before this week's performance deadline, we're still working
  // on the previous week's assignments.
  if (beforePerformanceDeadline && weekIndex > 0) {
    weekIndex = weekIndex - 1;
  }

  // --- legacy cycle math, pending removal (see LEGACY NOTE above) ---
  const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
  const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);

  return { weekIndex, cycleNumber, weekInCycle };
}

import { RawScoreRow, StaffWeekSummary } from '@/types/coachV2';

/**
 * DASH-5: resolves how many locked, required (non-self-select) pro moves a
 * staff member was actually assigned for the week. Supplied by the data
 * layer (useStaffWeeklyScores) from weekly_assignments; when absent (e.g.
 * TeamPage's weekOf-less call), required_count stays 0 and location-level
 * stats treat everyone as owing nothing.
 */
export type RequiredCountResolver = (row: RawScoreRow) => number;

export function aggregateStaffWeekSummary(
  rawRows: RawScoreRow[],
  weekOf: string,
  resolveRequiredCount?: RequiredCountResolver
): StaffWeekSummary[] {
  const staffMap = new Map<string, StaffWeekSummary>();

  rawRows.forEach((row) => {
    if (!staffMap.has(row.staff_id)) {
      staffMap.set(row.staff_id, {
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        staff_email: row.staff_email,
        user_id: row.user_id,
        role_id: row.role_id,
        role_name: row.role_name,
        location_id: row.location_id,
        location_name: row.location_name,
        group_id: row.group_id,
        group_name: row.group_name,
        week_of: weekOf,
        assignment_count: 0,
        conf_count: 0,
        perf_count: 0,
        required_count: resolveRequiredCount ? resolveRequiredCount(row) : 0,
        conf_required_done: 0,
        perf_required_done: 0,
        has_any_late: false,
        is_complete: false,
        scores: [],
      });
    }

    const summary = staffMap.get(row.staff_id)!;
    // NOTE: assignment_count is the count of returned rows (a non-submitter
    // gets one all-null placeholder row from the RPC), NOT the person's real
    // workload - that's required_count. Kept for per-row consumers (roster
    // score lists); location-level stats must use required_count.
    summary.assignment_count++;
    summary.scores.push(row);

    // Count scores
    if (row.confidence_score !== null) {
      summary.conf_count++;
      // self_select !== true also catches null (placeholder or unjoined
      // rows): a real score whose assignment didn't join is still credit
      // toward the required set, never silently dropped.
      if (row.self_select !== true) summary.conf_required_done++;
    }
    if (row.performance_score !== null) {
      summary.perf_count++;
      if (row.self_select !== true) summary.perf_required_done++;
    }

    // Track late flags
    if (row.confidence_late || row.performance_late) {
      summary.has_any_late = true;
    }
  });

  // Calculate is_complete: all assignments have both scores AND no late flags
  staffMap.forEach((summary) => {
    summary.is_complete =
      summary.assignment_count > 0 &&
      summary.conf_count === summary.assignment_count &&
      summary.perf_count === summary.assignment_count &&
      !summary.has_any_late;
  });

  return Array.from(staffMap.values());
}

/**
 * DASH-5 person-level completion: the week's task is done only when EVERY
 * required move has the rating. Fewer scores than required means a glitch
 * or an abandoned submission - either way, not done. required_count 0
 * means nothing was published for this person, so they can be neither
 * checked in nor missing.
 */
export function isCheckedIn(s: StaffWeekSummary): boolean {
  return s.required_count > 0 && s.conf_required_done >= s.required_count;
}

export function isCheckedOut(s: StaffWeekSummary): boolean {
  return s.required_count > 0 && s.perf_required_done >= s.required_count;
}

/** Staff who actually owe submissions this week (assignments published). */
export function owedStaff(staff: StaffWeekSummary[]): StaffWeekSummary[] {
  return staff.filter((s) => s.required_count > 0);
}

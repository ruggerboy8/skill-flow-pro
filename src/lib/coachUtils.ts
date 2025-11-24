import { RawScoreRow, StaffWeekSummary } from '@/types/coachV2';

export function aggregateStaffWeekSummary(
  rawRows: RawScoreRow[],
  weekOf: string
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
        organization_id: row.organization_id,
        organization_name: row.organization_name,
        week_of: weekOf,
        assignment_count: 0,
        conf_count: 0,
        perf_count: 0,
        has_any_late: false,
        is_complete: false,
        scores: [],
      });
    }

    const summary = staffMap.get(row.staff_id)!;
    summary.assignment_count++;
    summary.scores.push(row);

    // Count scores
    if (row.confidence_score !== null) {
      summary.conf_count++;
    }
    if (row.performance_score !== null) {
      summary.perf_count++;
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

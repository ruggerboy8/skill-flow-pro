// DASH-5: resolve how many pro moves a staff member is actually required to
// rate for a given week, from the locked weekly_assignments themselves -
// never from how many weekly_scores rows happen to exist (a non-submitter
// has zero rows; the old row-counting denominator floored everyone at 1).
//
// Scope rule mirrors view_staff_submission_windows: an assignment applies to
// a staff member when the role matches AND it is location-scoped to their
// location, org-scoped to their org, or platform-global (no org, no
// location). Self-select slots are excluded - "checked in" means every
// REQUIRED move is rated.

export interface RequiredMoveAssignment {
  role_id: number;
  org_id: string | null;
  location_id: string | null;
  self_select: boolean | null;
}

export interface RequiredMoveStaffScope {
  role_id: number;
  location_id: string;
  group_id: string;
}

/**
 * Build a resolver from the week's locked assignments plus a group→org map.
 * Results are memoized per (role, location, group) since every staff member
 * sharing those three shares a workload.
 */
export function buildRequiredCountResolver(
  assignments: RequiredMoveAssignment[],
  orgIdByGroupId: Map<string, string>,
): (staff: RequiredMoveStaffScope) => number {
  const required = assignments.filter(a => a.self_select !== true);
  const cache = new Map<string, number>();

  return (staff) => {
    const key = `${staff.role_id}|${staff.location_id}|${staff.group_id}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const orgId = orgIdByGroupId.get(staff.group_id) ?? null;
    const count = required.filter(a =>
      a.role_id === staff.role_id && (
        a.location_id === staff.location_id ||
        (a.location_id === null && a.org_id !== null && a.org_id === orgId) ||
        (a.location_id === null && a.org_id === null)
      )
    ).length;

    cache.set(key, count);
    return count;
  };
}

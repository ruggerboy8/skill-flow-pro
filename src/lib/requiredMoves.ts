// DASH-5: resolve the exact set of locked assignments a staff member must
// rate for a given week, from weekly_assignments itself - never from how
// many weekly_scores rows happen to exist (a non-submitter has zero rows;
// the old row-counting denominator floored everyone at 1).
//
// Scope rule: an assignment applies to a staff member when the role matches
// AND it is location-scoped to their location, org-scoped to their org, or
// platform-global (no org, no location).
//
// Returning the assignment-ID SET (not just a count) lets the aggregator
// credit only scores that belong to a required assignment (Codex P2 on PR
// #104): a stray score row from a superseded/unjoined assignment can never
// substitute for a missing required rating. The flip side is accepted: a
// score recorded under a since-replaced assignment for the same move shows
// as not done until re-entered - under-crediting is the safe failure.

export interface RequiredMoveAssignment {
  id: string | number;
  role_id: number;
  org_id: string | null;
  location_id: string | null;
}

export interface RequiredMoveStaffScope {
  role_id: number;
  location_id: string;
  group_id: string;
}

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Build a resolver from the week's locked assignments plus a group→org map.
 * Returns the set of required assignment keys in weekly_scores.assignment_id
 * format ("assign:<id>"). Memoized per (role, location, group) since every
 * staff member sharing those three shares a workload.
 */
export function buildRequiredAssignmentsResolver(
  assignments: RequiredMoveAssignment[],
  orgIdByGroupId: Map<string, string>,
): (staff: RequiredMoveStaffScope) => ReadonlySet<string> {
  const cache = new Map<string, ReadonlySet<string>>();

  return (staff) => {
    const key = `${staff.role_id}|${staff.location_id}|${staff.group_id}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const orgId = orgIdByGroupId.get(staff.group_id) ?? null;
    const ids = assignments
      .filter(a =>
        a.role_id === staff.role_id && (
          a.location_id === staff.location_id ||
          (a.location_id === null && a.org_id !== null && a.org_id === orgId) ||
          (a.location_id === null && a.org_id === null)
        )
      )
      .map(a => `assign:${a.id}`);

    const set: ReadonlySet<string> = ids.length > 0 ? new Set(ids) : EMPTY;
    cache.set(key, set);
    return set;
  };
}

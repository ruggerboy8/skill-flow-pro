/**
 * Merges the two "eras" of weekly_assignments into one copyable list.
 *
 * Discovered during the first supervised seed attempt (2026-08-20, Lake
 * Orion as source): in February 2026 the live app stopped writing
 * per-location assignment rows and switched to org-level rows
 * (`location_id is null`, `source = 'org'`). Every location's
 * location-scoped rows are frozen at or before 2026-02-09; all assignment
 * activity since then lives only at the org level. A copy that reads only
 * `location_id = <source>` therefore silently loses ~6 months of history
 * and, for staff hired after the switch, everything.
 *
 * The merge rules:
 *
 * 1. Rows in the future are dropped from BOTH eras. `capMonday` is the
 *    Monday (YYYY-MM-DD) of the week that should become the demo org's
 *    "current" week; the live table can already hold next week's org-level
 *    rows, and copying a week nobody has scored yet would make the shift
 *    math anchor "current" on an empty week.
 * 2. For any (role_id, week_start_date) where at least one LOCATION-scoped
 *    row exists, all org-level rows for that same (role, week) are dropped.
 *    During the overlap window (Dec 2025 - Feb 2026) both eras can hold
 *    rows for the same role-week; the location-scoped rows are what this
 *    location's staff actually saw and scored against, so they win. Keeping
 *    both would render 4-6 Pro Moves in a history week that really had 3.
 * 3. Output order is deterministic (week, then role, then display_order,
 *    then era) so the same inputs always produce the same copy order --
 *    the resumability machinery in seed.ts depends on determinism.
 */

export interface EraMergeRow {
  role_id: number;
  week_start_date: string;
  display_order: number;
}

export interface EraMergeResult<T extends EraMergeRow> {
  merged: T[];
  locationKept: number;
  orgKept: number;
  droppedFuture: number;
  droppedOverlap: number;
}

export function mergeAssignmentEras<T extends EraMergeRow>(
  locationRows: T[],
  orgRows: T[],
  capMonday: string,
): EraMergeResult<T> {
  const locationInRange = locationRows.filter((r) => r.week_start_date <= capMonday);
  const orgInRange = orgRows.filter((r) => r.week_start_date <= capMonday);
  const droppedFuture =
    locationRows.length - locationInRange.length + (orgRows.length - orgInRange.length);

  const locationRoleWeeks = new Set(locationInRange.map((r) => `${r.role_id}|${r.week_start_date}`));
  const orgSurvivors = orgInRange.filter((r) => !locationRoleWeeks.has(`${r.role_id}|${r.week_start_date}`));
  const droppedOverlap = orgInRange.length - orgSurvivors.length;

  // Location rows sort ahead of org rows on ties (era tag 0 vs 1), though
  // after rule 2 a genuine (role, week, display_order) tie can no longer
  // exist across eras.
  const tagged = [
    ...locationInRange.map((r) => ({ r, era: 0 })),
    ...orgSurvivors.map((r) => ({ r, era: 1 })),
  ];
  tagged.sort(
    (a, b) =>
      a.r.week_start_date.localeCompare(b.r.week_start_date) ||
      a.r.role_id - b.r.role_id ||
      a.r.display_order - b.r.display_order ||
      a.era - b.era,
  );

  return {
    merged: tagged.map((t) => t.r),
    locationKept: locationInRange.length,
    orgKept: orgSurvivors.length,
    droppedFuture,
    droppedOverlap,
  };
}

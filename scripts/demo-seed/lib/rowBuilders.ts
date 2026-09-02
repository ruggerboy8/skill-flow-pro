/**
 * Pure row-shaping helpers for weekly_assignments / weekly_scores. Kept
 * separate from seed.ts (which does the actual Supabase I/O and cannot be
 * unit tested without a live database) so this mapping logic can be tested
 * on its own.
 */

import {
  pickAllowedColumns,
  WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST,
  WEEKLY_SCORES_COPY_ALLOWLIST,
} from './columnAllowlist';

// ---------------------------------------------------------------------------
// weekly_assignments
// ---------------------------------------------------------------------------

export interface SourceAssignmentRow {
  role_id: number;
  week_start_date: string;
  display_order: number;
  action_id: number | null;
  competency_id: number | null;
  self_select: boolean;
}

export interface DemoAssignmentDraft {
  org_id: string;
  location_id: null;
  role_id: number;
  week_start_date: string;
  display_order: number;
  action_id: number | null;
  competency_id: number | null;
  status: string;
  source: string;
  self_select: boolean;
}

/**
 * One demo weekly_assignments row, copied from one source row, written at
 * the ORG level: `location_id` null, `source` 'org' -- exactly the shape
 * the live app has written since Feb 2026. Two things force this (both
 * Codex-flagged on PR #105, both verified against the live schema):
 *
 * - `weekly_assignments_source_check` only permits 'onboarding' / 'global'
 *   / 'org'; the original 'demo-seed' stamp could never insert.
 * - `weekly_assignments_check` requires source='org' rows to have
 *   location_id NULL (and org_id set), so the original plan of replicating
 *   one row per demo location could not insert either -- and would have
 *   been wrong anyway: every consumer (assembleWeek in
 *   src/lib/locationState.ts, useWeeklyAssignments) scopes assignments by
 *   org + role + week, never by location, so three per-location copies
 *   would have rendered as nine Pro Moves per staff member instead of
 *   three.
 *
 * One org-level row is automatically shared by all three demo locations;
 * the per-location texture Clip 3 needs comes from the weekly_scores
 * variance pass, not from giving locations different Pro Moves. Demo rows
 * remain identifiable as seed-authored via the demo org's own org_id.
 *
 * `status` is always forced to `'locked'`, regardless of what the source
 * row's status was. Decision (QA-flagged, DEMO-1a follow-up): every read
 * path in the app filters `weekly_assignments` on `status = 'locked'`
 * (src/lib/locationState.ts, useWeeklyAssignments, ConfidenceWizard,
 * PerformanceWizard, MonthView, GlobalAssignmentBuilder, TeamWeeklyFocus --
 * all of them). A copied row sitting at `'draft'` or any other source
 * status would exist in the table but be invisible everywhere in the app,
 * which defeats the point of copying "weeks of history" for Clip 2/3 and
 * silently breaks Clip 1's current-week guarantee. This is forced for ALL
 * copied weeks, not just the current one: historical accuracy of a
 * long-retired draft status has no value here, and a demo where only the
 * current week renders but the history doesn't would look broken on
 * camera. `status` is therefore not in WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST --
 * it is never read from the source row at all.
 */
export function buildDemoAssignmentDraft(source: SourceAssignmentRow, demoOrgId: string): DemoAssignmentDraft {
  const copied = pickAllowedColumns(source, WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST);
  return {
    org_id: demoOrgId,
    location_id: null,
    role_id: copied.role_id ?? source.role_id,
    week_start_date: copied.week_start_date ?? source.week_start_date,
    display_order: copied.display_order ?? source.display_order,
    action_id: copied.action_id ?? null,
    competency_id: copied.competency_id ?? null,
    status: 'locked',
    source: 'org',
    self_select: copied.self_select ?? false,
  };
}

// ---------------------------------------------------------------------------
// weekly_scores
// ---------------------------------------------------------------------------

export interface SourceScoreRow {
  confidence_score: number | null;
  confidence_date: string | null;
  confidence_late: boolean | null;
  performance_score: number | null;
  performance_date: string | null;
  performance_late: boolean | null;
  week_of: string | null;
}

export type ScoreSource = 'live' | 'backfill' | 'backfill_historical';

export interface DemoScoreDraft {
  staff_id: string;
  assignment_id: string;
  weekly_focus_id: string;
  entered_by: string;
  confidence_score: number | null;
  confidence_date: string | null;
  confidence_late: boolean | null;
  confidence_source: ScoreSource;
  performance_score: number | null;
  performance_date: string | null;
  performance_late: boolean | null;
  performance_source: ScoreSource;
  week_of: string | null;
  site_action_id: number | null;
  selected_action_id: number | null;
}

/**
 * One demo weekly_scores row. `confidence_source` / `performance_source`
 * are always `'backfill_historical'`: this data was never entered live by
 * the demo persona, it was imported wholesale by the seed script, which is
 * exactly what that enum value exists to distinguish from a real user's
 * `'live'` submission or a real user's own late `'backfill'`.
 *
 * `entered_by` is set to the demo staff member's own id (self-entry) --
 * the source row's original `entered_by` is not carried over because it
 * may point at a different real staff member (e.g. a coach) whose id has
 * no meaning in the demo org.
 */
export function buildDemoScoreDraft(
  source: SourceScoreRow,
  demoStaffId: string,
  demoAssignmentId: string,
  actionId: number | null,
): DemoScoreDraft {
  const copied = pickAllowedColumns(source, WEEKLY_SCORES_COPY_ALLOWLIST);
  return {
    staff_id: demoStaffId,
    assignment_id: `assign:${demoAssignmentId}`,
    // Same 'assign:' value in BOTH columns, exactly like rows the live app
    // writes (useReliableSubmission). The app upserts on
    // (staff_id, weekly_focus_id); a seeded row with only assignment_id
    // set can never be matched by that upsert, so the app tries to INSERT
    // instead and hits the unique (staff_id, assignment_id) index --
    // found live when Clip 1's real submit 409'd (2026-09-02).
    weekly_focus_id: `assign:${demoAssignmentId}`,
    entered_by: demoStaffId,
    confidence_score: copied.confidence_score ?? null,
    confidence_date: copied.confidence_date ?? null,
    confidence_late: copied.confidence_late ?? null,
    confidence_source: 'backfill_historical',
    performance_score: copied.performance_score ?? null,
    performance_date: copied.performance_date ?? null,
    performance_late: copied.performance_late ?? null,
    performance_source: 'backfill_historical',
    week_of: copied.week_of ?? null,
    site_action_id: actionId,
    selected_action_id: actionId,
  };
}

/**
 * Clears confidence + performance for exactly one staff member's current
 * week, leaving every other row untouched. Used to guarantee Clip 1's "an
 * uncompleted current-week assignment for demo-staff" even though the
 * copied source history for that week may have been a real, completed
 * submission.
 */
export function clearCurrentWeekScore(
  rows: readonly DemoScoreDraft[],
  staffId: string,
  currentWeekOf: string,
): DemoScoreDraft[] {
  return rows.map((r) => {
    if (r.staff_id !== staffId || r.week_of !== currentWeekOf) return r;
    return {
      ...r,
      confidence_score: null,
      confidence_date: null,
      confidence_late: null,
      performance_score: null,
      performance_date: null,
      performance_late: null,
    };
  });
}

import { supabase } from "@/integrations/supabase/client";
import { assembleWeek as locationAssembleWeek, getLocationWeekContext } from "./locationState";
// (self-select helpers removed 2026-07-25 — self-select was never adopted; roadmap 2.2)
 // NOTE: nowUtc/getAnchors imports removed: not used in site-centric assembly

export interface WeekAssignment {
  weekly_focus_id: string;
  type: "site" | "backlog" | "selfSelect";
  pro_move_id?: number;
  action_statement: string;
  domain_name: string;
  intervention_text?: string | null;
  required: boolean;
  locked: boolean;
  backlog_id?: string;
  slot_index?: number;
  display_order: number;
}

/**
 * Site-centric: derive (cycleNumber, weekInCycle) from the location's calendar.
 * Progress-based is only used if explicitly requested via simOverrides.mode === 'progress'
 * (kept for legacy/simulation needs).
 */
async function findUserActiveWeek(
  userId: string,
  staffId: string,
  roleId: number,
  locationId: string,
  simOverrides?: any,
  now?: Date
): Promise<{ cycleNumber: number; weekInCycle: number }> {
  // (Legacy "progress mode" sim branch removed 2026-07-24 — it called the
  // retired get_last_progress_week RPC; site-centric is the only mode.)

  // Default: SITE-CENTRIC (location calendar)
  const context = await getLocationWeekContext(locationId, now ?? new Date());
  return { cycleNumber: context.cycleNumber, weekInCycle: context.weekInCycle };
}

/**
 * Assemble a user's current week assignments based on the location’s current week.
 * Backfill gating happens in routing; by the time we run this, the user is allowed to see current week.
 */
export async function assembleCurrentWeek(
  userId: string,
  staffData: { id: string; role_id: number; primary_location_id: string },
  simOverrides?: any
): Promise<{
  assignments: WeekAssignment[];
  cycleNumber: number;
  weekInCycle: number;
  /**
   * ASG-1 Fix 2: the canonical org-timezone Monday ('yyyy-MM-dd') the
   * assignments above were loaded under (forwarded from
   * locationState.assembleWeek). Callers that also need a "Week of" label
   * or an excused-week lookup should key off THIS value instead of
   * recomputing a Monday from the location's own timezone, so the label,
   * the exemption check, and the loaded assignments can never disagree.
   * `null` only when the location/org couldn't be resolved at all (in
   * which case `assignments` is always `[]` too).
   */
  weekStartDate: string | null;
}> {
  try {
    const effectiveNow =
      simOverrides?.enabled && simOverrides?.nowISO
        ? new Date(simOverrides.nowISO)
        : new Date();

    // Use staff data passed from caller (no redundant query)
    if (!staffData.primary_location_id)
      throw new Error("Staff member has no assigned location");

    // Derive active week (site-centric by default)
    const { cycleNumber, weekInCycle } = await findUserActiveWeek(
      userId,
      staffData.id,
      staffData.role_id,
      staffData.primary_location_id,
      simOverrides,
      effectiveNow
    );

    // Build assignments
    const { assignments, weekStartDate } = await locationAssembleWeek({
      userId,
      roleId: staffData.role_id,
      locationId: staffData.primary_location_id,
      cycleNumber,
      weekInCycle,
      simOverrides,
    });

    return {
      assignments: assignments.sort((a, b) => a.display_order - b.display_order),
      cycleNumber,
      weekInCycle,
      weekStartDate,
    };
  } catch (error) {
    console.error("Error assembling current week:", error);
    return { assignments: [], cycleNumber: 1, weekInCycle: 1, weekStartDate: null };
  }
}

// Re-export (unchanged)

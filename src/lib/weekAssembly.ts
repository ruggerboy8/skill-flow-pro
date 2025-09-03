import { supabase } from "@/integrations/supabase/client";
import { assembleWeek as locationAssembleWeek, getLocationWeekContext } from "./locationState";
import { areSelectionsLocked, saveUserSelection } from "./backlog"; // (getOpenBacklogCountV2 not used here)
 // NOTE: nowUtc/getAnchors imports removed: not used in site-centric assembly

export interface WeekAssignment {
  weekly_focus_id: string;
  type: "site" | "backlog" | "selfSelect";
  pro_move_id?: number;
  action_statement: string;
  domain_name: string;
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
  // Explicit opt-in to progress mode (legacy / special sims)
  if (simOverrides?.mode === "progress") {
    console.log("[week-assembly] Using PROGRESS-based week calculation (explicit opt-in)");
    const { data: locationData } = await supabase
      .from("locations")
      .select("cycle_length_weeks")
      .eq("id", locationId)
      .single();

    if (!locationData) {
      throw new Error(`Location not found for locationId: ${locationId}`);
    }
    const cycleLength = locationData.cycle_length_weeks;

    const { data, error } = await supabase.rpc("get_last_progress_week", {
      p_staff_id: staffId,
    });
    if (error) throw error;

    let cycleNumber = data?.[0]?.last_cycle ?? 1;
    let weekInCycle = data?.[0]?.last_week ?? 1;
    const isComplete = !!data?.[0]?.is_complete;

    if (isComplete) {
      weekInCycle += 1;
      if (weekInCycle > cycleLength) {
        weekInCycle = 1;
        cycleNumber += 1;
      }
    }
    return { cycleNumber, weekInCycle };
  }

  // Default: SITE-CENTRIC (location calendar)
  console.log("[week-assembly] Using SITE-centric (time/location) week calculation");
  const context = await getLocationWeekContext(locationId, now ?? new Date());
  return { cycleNumber: context.cycleNumber, weekInCycle: context.weekInCycle };
}

/**
 * Assemble a user's current week assignments based on the location’s current week.
 * Backfill gating happens in routing; by the time we run this, the user is allowed to see current week.
 */
export async function assembleCurrentWeek(
  userId: string,
  simOverrides?: any
): Promise<{
  assignments: WeekAssignment[];
  cycleNumber: number;
  weekInCycle: number;
}> {
  try {
    console.log("=== ASSEMBLING CURRENT WEEK (SITE-CENTRIC) ===");
    console.log("Input params:", { userId, simOverrides });

    const effectiveNow =
      simOverrides?.enabled && simOverrides?.nowISO
        ? new Date(simOverrides.nowISO)
        : new Date();

    // Staff + location
    const { data: staffData } = await supabase
      .from("staff")
      .select("id, role_id, primary_location_id")
      .eq("user_id", userId)
      .single();

    if (!staffData) throw new Error("Staff record not found");
    if (!staffData.primary_location_id)
      throw new Error("Staff member has no assigned location");

    console.log("Staff data:", staffData);
    console.log("Effective now:", effectiveNow);

    // Derive active week (site-centric by default)
    const { cycleNumber, weekInCycle } = await findUserActiveWeek(
      userId,
      staffData.id,
      staffData.role_id,
      staffData.primary_location_id,
      simOverrides,
      effectiveNow
    );

    console.log("Active week (site-centric):", { cycleNumber, weekInCycle });

    // Build assignments
    const assignments = await locationAssembleWeek({
      userId,
      roleId: staffData.role_id,
      locationId: staffData.primary_location_id,
      cycleNumber,
      weekInCycle,
      simOverrides,
    });

    console.log("Assignments:", assignments);

    return {
      assignments: assignments.sort((a, b) => a.display_order - b.display_order),
      cycleNumber,
      weekInCycle,
    };
  } catch (error) {
    console.error("Error assembling current week:", error);
    return { assignments: [], cycleNumber: 1, weekInCycle: 1 };
  }
}

// Re-export (unchanged)
export { saveUserSelection, areSelectionsLocked } from "./backlog";
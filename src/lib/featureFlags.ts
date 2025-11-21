export const isV2 =
  (import.meta.env.VITE_V2?.toLowerCase?.() === 'true') || true; // default on

// If/when you want to flip it via env:
// VITE_V2=true  -> V2 on
// VITE_V2=false -> V2 off

/**
 * Phase 2: Unified assignments feature flag
 * Controls whether to read from weekly_assignments (true) or legacy weekly_plan/weekly_focus (false)
 * DEFAULT: false (legacy behavior maintained until Phase 3 cutover)
 */
export const useWeeklyAssignmentsV2Enabled = 
  (import.meta.env.VITE_USE_WEEKLY_ASSIGNMENTS?.toLowerCase?.() === 'true') || false;
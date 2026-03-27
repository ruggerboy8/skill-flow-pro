/**
 * Role archetype system — single source of truth for how the platform
 * treats each role behaviorally.
 *
 * `archetype_code` is stored on the `roles` table and backfilled for all
 * existing roles. System behavior is driven by this map, NOT by raw role_id
 * integers, so new practice-type variants (e.g. lead_da_gen_uk) inherit the
 * correct behavior automatically.
 */

export type ArchetypeCode =
  | 'front_desk'
  | 'dental_assistant'
  | 'practice_manager'
  | 'doctor'
  | 'lead_dental_assistant'
  | 'treatment_coordinator'
  | 'hygienist';

export interface ArchetypeBehavior {
  /** Shows ThisWeekPanel with pro move assignments + confidence/performance submission */
  hasWeeklyCadence: boolean;
  /** Appears as a tab in AdminBuilder planner */
  hasPlannerTab: boolean;
  /**
   * Dual-panel mode: this archetype also shows the parent archetype's weekly
   * assignment. Used for Lead Dental Assistant, who attends both the regular
   * dental assistant meeting AND a lead-specific meeting.
   */
  dualPanel: boolean;
  /**
   * When dualPanel is true, this is the archetype whose weekly assignment is
   * shown in the first (parent) panel.
   */
  parentArchetype?: ArchetypeCode;
  /** Human-readable label for display in the planner and UI */
  label: string;
}

export const ARCHETYPES: Record<ArchetypeCode, ArchetypeBehavior> = {
  front_desk: {
    label: 'Front Desk',
    hasWeeklyCadence: true,
    hasPlannerTab: true,
    dualPanel: false,
  },
  dental_assistant: {
    label: 'Dental Assistant',
    hasWeeklyCadence: true,
    hasPlannerTab: true,
    dualPanel: false,
  },
  practice_manager: {
    label: 'Practice Manager',
    hasWeeklyCadence: true,
    hasPlannerTab: true,
    dualPanel: false,
  },
  doctor: {
    label: 'Doctor',
    hasWeeklyCadence: false,
    hasPlannerTab: false,
    dualPanel: false,
  },
  lead_dental_assistant: {
    label: 'Lead Dental Assistant',
    hasWeeklyCadence: true,
    hasPlannerTab: true,
    dualPanel: true,
    parentArchetype: 'dental_assistant',
  },
  treatment_coordinator: {
    label: 'Treatment Coordinator',
    hasWeeklyCadence: false,
    hasPlannerTab: false,
    dualPanel: false,
  },
  hygienist: {
    label: 'Hygienist',
    hasWeeklyCadence: false,
    hasPlannerTab: false,
    dualPanel: false,
  },
};

/** Convenience: archetype options for dropdowns */
export const ARCHETYPE_OPTIONS = (Object.keys(ARCHETYPES) as ArchetypeCode[]).map(
  (code) => ({ value: code, label: ARCHETYPES[code].label })
);

/** Returns the archetype behavior for a given code, or undefined if unknown */
export function getArchetype(code: string | null | undefined): ArchetypeBehavior | undefined {
  if (!code) return undefined;
  return ARCHETYPES[code as ArchetypeCode];
}

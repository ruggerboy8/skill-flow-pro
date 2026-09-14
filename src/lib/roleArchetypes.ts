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
    // Retired 2026-07-21: the lead "training" model (a builder tab + a second
    // "Lead Pro Move" home panel) is replaced by Ariyana's weekly lead focus.
    // Leads are wielded as location-level behavior-change agents, not trained via
    // their own pro-move curriculum. staff.is_lead stays as the lead identity.
    hasPlannerTab: false,
    dualPanel: false,
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

/**
 * Archetypes whose `roles` rows must never be offered as a selectable
 * role_id when inviting or reassigning a staff member's role.
 *
 * `lead_dental_assistant` has `hasPlannerTab: false` above (see its comment):
 * the weekly planner has no tab to build rotations for it, so a staff row
 * created with this role_id gets zero weekly Pro Moves, forever. The
 * correct way to mark someone a lead is the BASE role (e.g. Dental
 * Assistant) plus `staff.is_lead = true` — that's the config used by every
 * real Alcan lead. Picking "Lead Dental Assistant" as a role_id directly is
 * a UI trap, not a valid alternative (role-picker-trap ticket, 2026-09).
 *
 * This does not make the role rows themselves invalid — they're still used
 * for competency lookups (see useLeadRoleId) and content authoring, so they
 * stay in the `roles` table and keep showing up correctly for any staff row
 * that already has one. Only the list of pickable options is filtered.
 */
export const DISPLAY_ONLY_ROLE_ARCHETYPES: ArchetypeCode[] = ['lead_dental_assistant'];

/**
 * True if a role should appear as an option in an assignable role picker
 * (inviting a new staff member, or reassigning an existing one's role_id).
 * Roles with no archetype_code (not yet backfilled) are treated as
 * assignable rather than silently hidden.
 */
export function isAssignableRoleOption(role: { archetype_code?: string | null }): boolean {
  if (!role.archetype_code) return true;
  return !DISPLAY_ONLY_ROLE_ARCHETYPES.includes(role.archetype_code as ArchetypeCode);
}

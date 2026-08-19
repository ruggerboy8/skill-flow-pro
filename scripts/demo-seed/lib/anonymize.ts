/**
 * Anonymization mapping: source Alcan staff -> fictional Bluebird cast.
 *
 * Everything here is a pure function so the mapping (and the guarantee that
 * no source name/email survives) can be tested without a database.
 */

import type { CastMember } from '../cast';
import {
  STAFF_COPY_ALLOWLIST,
  pickAllowedColumns,
} from './columnAllowlist';

export interface SourceStaffIdentity {
  id: string;
}

export interface CastAssignment {
  sourceId: string;
  cast: CastMember;
}

/**
 * A source staff member as seen by persona selection: enough to judge
 * whether they're a suitable pick for demo-staff/demo-coach/demo-admin.
 */
export interface PersonaCandidate {
  id: string;
  roleId: number | null;
  isCoach: boolean;
  /**
   * Most recent week_of ("yyyy-MM-dd") among this staff member's own
   * weekly_scores rows, or null if they have none at all.
   */
  lastActivity: string | null;
}

/**
 * Picks the source staff member best suited to become the demo-staff
 * (participant) login: must have a role (`roleId != null`) and must have
 * at least one weekly_scores row of their own (`lastActivity != null`),
 * preferring whichever qualifying candidate is most recently active.
 *
 * Selection rule and why: Clip 1 needs this specific person to plausibly
 * land a current-week assignment after the copy + shift. Someone with no
 * role, or no assignment history at all, is a poor bet for that -- picking
 * them arbitrarily (the old behavior: whoever sorted first by UUID) could
 * silently degrade Clip 1's guarantee to a console warning. Ties are
 * broken by id for determinism (same source roster always picks the same
 * person, run to run).
 *
 * Hard-fails (does not fall back to an unsuitable pick) if no candidate
 * qualifies: Clip 1 depends entirely on this choice, so a bad location
 * pick has to stop the run with a clear message, not produce a demo org
 * whose "current week" is empty.
 */
export function selectParticipant(candidates: readonly PersonaCandidate[]): string {
  const eligible = candidates.filter((c) => c.roleId != null && c.lastActivity != null);
  if (eligible.length === 0) {
    throw new Error(
      'No source staff member is suitable to become the demo-staff (participant) login: none has ' +
        'both a role_id and any weekly_scores history. Pick a different --source-location.',
    );
  }
  return [...eligible].sort((a, b) => {
    const byActivity = (b.lastActivity as string).localeCompare(a.lastActivity as string); // most recent first
    if (byActivity !== 0) return byActivity;
    return a.id.localeCompare(b.id); // deterministic tie-break
  })[0].id;
}

/**
 * Picks the source staff member best suited to become the demo-coach
 * login, excluding ids already claimed by another persona (e.g. the
 * chosen participant). Selection rule: prefer someone who was already a
 * real coach (`isCoach`) and has a role; fall back to anyone with a role;
 * fall back to whoever is left. Deterministic (ties broken by id).
 */
export function selectCoach(candidates: readonly PersonaCandidate[], excludeIds: readonly string[]): string {
  return selectBySuitability(candidates, excludeIds, (c) => c.isCoach, 'demo-coach');
}

/**
 * Picks the source staff member best suited to become the demo-admin
 * login, excluding ids already claimed by another persona. Selection
 * rule: prefer anyone with a role (a real, placed staff member reads
 * better as an admin on camera than someone with no role at all); fall
 * back to whoever is left. Deterministic (ties broken by id).
 */
export function selectAdmin(candidates: readonly PersonaCandidate[], excludeIds: readonly string[]): string {
  return selectBySuitability(candidates, excludeIds, () => false, 'demo-admin');
}

function selectBySuitability(
  candidates: readonly PersonaCandidate[],
  excludeIds: readonly string[],
  prefer: (c: PersonaCandidate) => boolean,
  personaLabel: string,
): string {
  const excluded = new Set(excludeIds);
  const pool = candidates.filter((c) => !excluded.has(c.id));
  if (pool.length === 0) {
    throw new Error(`No source staff left to become the ${personaLabel} login.`);
  }
  const byId = (a: PersonaCandidate, b: PersonaCandidate) => a.id.localeCompare(b.id);
  const preferredWithRole = pool.filter((c) => prefer(c) && c.roleId != null).sort(byId);
  if (preferredWithRole.length > 0) return preferredWithRole[0].id;
  const withRole = pool.filter((c) => c.roleId != null).sort(byId);
  if (withRole.length > 0) return withRole[0].id;
  return [...pool].sort(byId)[0].id;
}

/**
 * Maps every source staff member to a fictional cast identity.
 *
 * The three login personas (participant/coach/admin, tagged in cast.ts via
 * `loginRole`) are assigned first, by suitability (see
 * `selectParticipant` / `selectCoach` / `selectAdmin`) rather than
 * arbitrary sort order. Every remaining source staff member is then zipped,
 * sorted by id, with the remaining (non-login) cast members in cast-list
 * order. The same source roster always maps to the same demo identities on
 * every re-run -- this is what makes the seed idempotent and what makes
 * `--refresh` safe to run repeatedly without reshuffling who is who.
 *
 * Throws if the cast list is smaller than the source roster; the fix is to
 * add names to scripts/demo-seed/cast.ts, not to wrap around and reuse a
 * cast member for two different source people.
 */
export function assignCast(
  candidates: readonly PersonaCandidate[],
  cast: readonly CastMember[],
): CastAssignment[] {
  if (candidates.length > cast.length) {
    throw new Error(
      `cast.ts has ${cast.length} entries but the source location has ${candidates.length} ` +
        `staff. Add more fictional names to scripts/demo-seed/cast.ts before seeding this location.`,
    );
  }

  const participantCast = cast.find((c) => c.loginRole === 'participant');
  const coachCast = cast.find((c) => c.loginRole === 'coach');
  const adminCast = cast.find((c) => c.loginRole === 'admin');
  if (!participantCast || !coachCast || !adminCast) {
    throw new Error(
      'cast.ts must have exactly one entry each tagged loginRole "participant", "coach", and "admin".',
    );
  }

  const participantId = selectParticipant(candidates);
  const coachId = selectCoach(candidates, [participantId]);
  const adminId = selectAdmin(candidates, [participantId, coachId]);

  const claimed = new Set([participantId, coachId, adminId]);
  const remainingCandidates = [...candidates]
    .filter((c) => !claimed.has(c.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const remainingCast = cast.filter((c) => !c.loginRole);

  const assignments: CastAssignment[] = [
    { sourceId: participantId, cast: participantCast },
    { sourceId: coachId, cast: coachCast },
    { sourceId: adminId, cast: adminCast },
  ];
  remainingCandidates.forEach((c, i) => {
    assignments.push({ sourceId: c.id, cast: remainingCast[i] });
  });

  return assignments;
}

export function fullName(cast: CastMember): string {
  return `${cast.firstName} ${cast.lastName}`;
}

/**
 * True if `text` contains any real name or email from the source roster.
 * Used by tests to prove the anonymization actually removes identifying
 * values, not just that it produces *some* different-looking string.
 */
export function containsAnySourceIdentity(
  text: string,
  sourceNames: readonly string[],
  sourceEmails: readonly string[],
): boolean {
  const lower = text.toLowerCase();
  return (
    sourceNames.some((n) => !!n && lower.includes(n.toLowerCase())) ||
    sourceEmails.some((e) => !!e && lower.includes(e.toLowerCase()))
  );
}

// ---------------------------------------------------------------------------
// Demo staff row construction
// ---------------------------------------------------------------------------

export interface SourceStaffRow {
  id: string;
  name: string;
  email: string;
  role_id: number | null;
  hire_date: string;
  is_coach: boolean;
  is_doctor: boolean | null;
  is_lead: boolean;
  is_office_manager: boolean;
  is_participant: boolean;
  participation_start_at: string | null;
}

export interface DemoStaffDraft {
  name: string;
  email: string;
  primary_location_id: string;
  role_id: number | null;
  hire_date: string;
  is_coach: boolean;
  is_doctor: boolean | null;
  is_lead: boolean;
  is_office_manager: boolean;
  is_participant: boolean;
  is_org_admin: boolean;
  is_super_admin: boolean;
  participation_start_at: string | null;
}

/**
 * Builds the insertable demo staff row for one source staff member.
 *
 * - Name and email always come from `cast`, never from `source`.
 * - Structural flags (role, hire date, coach/lead/office-manager/doctor,
 *   participation) come from `source` through the allowlist.
 * - `is_super_admin` is always false: no copied row is ever granted
 *   platform-level admin, only the three named login personas get elevated
 *   flags, and even those stay short of super admin.
 * - `is_org_admin` / `is_coach` / `is_participant` are forced true for the
 *   cast member tagged with the matching `loginRole`, regardless of what
 *   the source row had, since that member is about to receive a real login
 *   used to demonstrate that persona.
 */
export function buildDemoStaffDraft(
  source: SourceStaffRow,
  cast: CastMember,
  demoLocationId: string,
): DemoStaffDraft {
  const copied = pickAllowedColumns(source, STAFF_COPY_ALLOWLIST);
  const loginRole = cast.loginRole;

  return {
    name: fullName(cast),
    email: cast.email,
    primary_location_id: demoLocationId,
    role_id: copied.role_id ?? null,
    hire_date: copied.hire_date ?? source.hire_date,
    is_coach: loginRole === 'coach' ? true : Boolean(copied.is_coach),
    is_doctor: copied.is_doctor ?? null,
    is_lead: Boolean(copied.is_lead),
    is_office_manager: Boolean(copied.is_office_manager),
    is_participant: loginRole === 'participant' ? true : Boolean(copied.is_participant),
    is_org_admin: loginRole === 'admin',
    is_super_admin: false,
    participation_start_at: copied.participation_start_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Round-robin location distribution
// ---------------------------------------------------------------------------

/**
 * Deterministically spreads the (id-sorted) source roster across the demo
 * org's locations, round-robin. This is what gives Clip 3 ("3 locations, 9
 * to 12 staff") its per-location spread instead of dumping every copied
 * staff member into a single demo location.
 */
export function assignLocationRoundRobin(
  sourceStaff: SourceStaffIdentity[],
  demoLocationIds: readonly string[],
): Map<string, string> {
  if (demoLocationIds.length === 0) {
    throw new Error('assignLocationRoundRobin: no demo location ids provided');
  }
  const sorted = [...sourceStaff].sort((a, b) => a.id.localeCompare(b.id));
  const map = new Map<string, string>();
  sorted.forEach((s, i) => {
    map.set(s.id, demoLocationIds[i % demoLocationIds.length]);
  });
  return map;
}

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
 * Deterministically zips source staff (sorted by id) with the fixed cast
 * list, in cast-list order. The same source roster always maps to the same
 * demo identities on every re-run -- this is what makes the seed idempotent
 * and what makes `--refresh` safe to run repeatedly without reshuffling who
 * is who.
 *
 * Throws if the cast list is smaller than the source roster; the fix is to
 * add names to scripts/demo-seed/cast.ts, not to wrap around and reuse a
 * cast member for two different source people.
 */
export function assignCast(
  sourceStaff: SourceStaffIdentity[],
  cast: readonly CastMember[],
): CastAssignment[] {
  if (sourceStaff.length > cast.length) {
    throw new Error(
      `cast.ts has ${cast.length} entries but the source location has ${sourceStaff.length} ` +
        `staff. Add more fictional names to scripts/demo-seed/cast.ts before seeding this location.`,
    );
  }
  const sorted = [...sourceStaff].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map((s, i) => ({ sourceId: s.id, cast: cast[i] }));
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

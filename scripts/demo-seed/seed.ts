/**
 * DEMO-1a seed script -- creates/refreshes the "Bluebird Dental" demo org.
 *
 * Run with tsx, never with plain `node` (this is TypeScript, ESM, and uses
 * top-level path resolution relative to this file):
 *
 *   npx tsx scripts/demo-seed/seed.ts --source-location=<uuid> --dry-run
 *
 * See scripts/demo-seed/README.md for full usage, environment setup, and
 * the rollover/reminder safety findings for this org.
 *
 * WHAT THIS DOES NOT DO: this file is orchestration/IO only. Every piece of
 * actual decision-making logic (the anonymization mapping, the column
 * allowlists, the confidence-score variance shaping, the --refresh week
 * math) lives in scripts/demo-seed/lib/*.ts as pure, unit-tested functions.
 * This file's job is: read from Supabase, call those functions, write back
 * to Supabase, and print what happened.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAST } from './cast';
import {
  assignCast,
  assignLocationRoundRobin,
  buildDemoStaffDraft,
  containsAnySourceIdentity,
  fullName,
  type PersonaCandidate,
  type SourceStaffRow,
} from './lib/anonymize';
import {
  buildDemoAssignmentDraft,
  buildDemoScoreDraft,
  clearCurrentWeekScore,
  type SourceAssignmentRow,
  type SourceScoreRow,
  type DemoScoreDraft,
} from './lib/rowBuilders';
import { shapeVariance, type ScoreLike } from './lib/variance';
import { computeWeekShiftDays, shiftDateString } from './lib/refreshWeek';
// Same app helper lib/refreshWeek.ts uses, imported directly here too for
// computing program_start_date at first-seed time. See COR-1 / calendarDate.ts.
import { mondayInTimezone } from '../../src/lib/dateUtils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.join(__dirname, '.env') });

// ---------------------------------------------------------------------------
// Demo org fixtures -- the stable identity DEMO-1a's idempotency keys off
// ---------------------------------------------------------------------------

const DEMO_ORG = {
  name: 'Bluebird Dental',
  slug: 'bluebird-dental',
  appDisplayName: 'Bluebird Dental',
};

const DEMO_GROUP = {
  name: 'Bluebird Dental Group',
  slug: 'bluebird-dental-group',
};

const DEMO_LOCATIONS = [
  { name: 'Bluebird Uptown', slug: 'bluebird-uptown', timezone: 'America/Chicago' },
  { name: 'Bluebird Riverside', slug: 'bluebird-riverside', timezone: 'America/New_York' },
  { name: 'Bluebird Lakeside', slug: 'bluebird-lakeside', timezone: 'America/Los_Angeles' },
] as const;

/** All week-repointing math anchors on the first location's timezone. */
const ANCHOR_TZ = DEMO_LOCATIONS[0].timezone;

/** cycle_length_weeks for the demo locations -- matches the app's stated default. */
const CYCLE_LENGTH_WEEKS = 6;

/**
 * Weeks elapsed between program_start_date and the moment the org is first
 * seeded. 15 weeks = 2 full 6-week cycles + 3 weeks, landing the current
 * week at week-in-cycle 4 of 6: comfortably mid-cycle, not week 1 (which
 * some legacy code treats as "just onboarded") and not the last week.
 */
const PROGRAM_WEEKS_ELAPSED_AT_SEED = 15;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  sourceLocationId: string | null;
  dryRun: boolean;
  refresh: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let sourceLocationId: string | null = null;
  let dryRun = false;
  let refresh = false;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--refresh') refresh = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--source-location=')) {
      sourceLocationId = arg.slice('--source-location='.length);
    } else {
      console.error(`Unrecognized argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  return { sourceLocationId, dryRun, refresh };
}

function printHelp(): void {
  console.log(`
Usage: npx tsx scripts/demo-seed/seed.ts --source-location=<uuid> [--dry-run] [--refresh]

  --source-location=<uuid>  Required for the first (fresh) seed. The live
                             Alcan location whose staff + weekly_assignments
                             + weekly_scores get copied and anonymized into
                             the Bluebird Dental demo org. Ignored if the
                             demo org already exists.
  --dry-run                 Print what would be written without writing.
  --refresh                 If the demo org already exists, re-point its
                             copied weeks so the "current week" lands on
                             the Monday of the week this is run in.

Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_STAFF_PASSWORD,
DEMO_COACH_PASSWORD, DEMO_ADMIN_PASSWORD from scripts/demo-seed/.env
(see .env.example). Never pass a real key on the command line.
`);
}

// ---------------------------------------------------------------------------
// Small pure-ish helpers kept local (too tied to the DB row shapes here to
// be worth relocating to lib/, per the "smallest extraction" principle --
// see lib/*.test.ts for the logic that *is* worth testing in isolation).
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('See scripts/demo-seed/.env.example.');
    process.exit(1);
  }
  return value;
}

/** A random password for cast members who never receive a real login. */
function randomUnusedPassword(): string {
  return randomBytes(24).toString('base64url');
}

const demoAssignmentKey = (locationId: string, roleId: number, week: string, slot: number): string =>
  `${locationId}|${roleId}|${week}|${slot}`;

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!args.dryRun) {
    requireEnv('DEMO_STAFF_PASSWORD');
    requireEnv('DEMO_COACH_PASSWORD');
    requireEnv('DEMO_ADMIN_PASSWORD');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\nDEMO-1a seed -- ${args.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}${args.refresh ? ', --refresh' : ''}\n`);

  const { data: existingOrg, error: existingOrgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', DEMO_ORG.slug)
    .maybeSingle();
  if (existingOrgErr) throw existingOrgErr;

  if (existingOrg) {
    console.log(`Demo org "${DEMO_ORG.slug}" already exists (id ${existingOrg.id}).`);

    const completeness = await assessOrgCompleteness(supabase, existingOrg.id);
    if (!completeness.complete) {
      // Issue 2: a previous run died partway through (org row landed, but
      // staff/assignments never finished). Do not report "nothing to do"
      // here -- resume the copy. freshSeed is itself idempotent throughout
      // (get-or-create for staff/auth users, natural-key get-or-create for
      // assignments, skip-if-exists for scores), so calling it again picks
      // up exactly where the previous attempt stopped instead of
      // duplicating anything already written.
      console.log(
        `Demo org looks incomplete (staff=${completeness.staffCount}, ` +
          `assignments=${completeness.assignmentCount}) -- resuming the copy.`,
      );
      if (!args.sourceLocationId) {
        console.error(
          'Resuming an incomplete seed needs --source-location=<uuid> again (the same location as ' +
            'before is fine -- already-created rows are detected and skipped, not duplicated).',
        );
        process.exit(1);
      }
      if (args.refresh) {
        console.log('Ignoring --refresh until the initial copy finishes; re-run --refresh afterward.');
      }
      await freshSeed(supabase, args.sourceLocationId, args.dryRun);
      return;
    }

    if (args.refresh) {
      await refreshExistingOrg(supabase, existingOrg.id, args.dryRun);
    } else {
      console.log('Nothing to do. Pass --refresh to re-point the current week, or delete the');
      console.log('demo org first if you want a completely fresh copy.');
    }
    return;
  }

  if (!args.sourceLocationId) {
    console.error('Demo org does not exist yet. --source-location=<uuid> is required for the first seed.');
    process.exit(1);
  }

  await freshSeed(supabase, args.sourceLocationId, args.dryRun);
}

/**
 * Best-effort completeness check for an already-existing demo org. Not a
 * precise "does it have everything the source location had" comparison
 * (that would require re-reading the source location, which we may not
 * have a --source-location for yet) -- just enough to tell "org row exists
 * but the copy clearly never finished" apart from "fully seeded, nothing
 * to do here". staffCount >= 3 covers the 3 login personas; assignmentCount
 * > 0 covers the weekly_assignments copy. See README "Resuming an
 * interrupted seed" for the full reasoning.
 */
async function assessOrgCompleteness(
  supabase: SupabaseClient,
  demoOrgId: string,
): Promise<{ complete: boolean; staffCount: number; assignmentCount: number }> {
  const locationIds = await demoLocationIds(supabase, demoOrgId);
  let staffCount = 0;
  if (locationIds.length > 0) {
    const { count, error } = await supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .in('primary_location_id', locationIds);
    if (error) throw error;
    staffCount = count ?? 0;
  }

  const { count: assignmentCount, error: assignErr } = await supabase
    .from('weekly_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', demoOrgId)
    .is('superseded_at', null);
  if (assignErr) throw assignErr;

  return {
    complete: locationIds.length >= DEMO_LOCATIONS.length && staffCount >= 3 && (assignmentCount ?? 0) > 0,
    staffCount,
    assignmentCount: assignmentCount ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Fresh seed: source location does not exist in the demo org yet
// ---------------------------------------------------------------------------

async function freshSeed(supabase: SupabaseClient, sourceLocationId: string, dryRun: boolean): Promise<void> {
  // --- 1. Read every source row we need, up front ---------------------------
  const { data: sourceLocation, error: locErr } = await supabase
    .from('locations')
    .select('id, group_id')
    .eq('id', sourceLocationId)
    .maybeSingle();
  if (locErr) throw locErr;
  if (!sourceLocation) {
    console.error(`No location found with id ${sourceLocationId}.`);
    process.exit(1);
  }

  const { data: sourceGroup, error: groupErr } = await supabase
    .from('practice_groups')
    .select('id, organization_id')
    .eq('id', sourceLocation.group_id)
    .maybeSingle();
  if (groupErr) throw groupErr;
  if (!sourceGroup) throw new Error(`Source location ${sourceLocationId} has no practice_groups row`);

  const { data: sourceOrg, error: orgErr } = await supabase
    .from('organizations')
    .select('id, practice_type')
    .eq('id', sourceGroup.organization_id)
    .maybeSingle();
  if (orgErr) throw orgErr;

  const { data: sourceStaffRaw, error: staffErr } = await supabase
    .from('staff')
    .select(
      'id, name, email, role_id, hire_date, is_coach, is_doctor, is_lead, is_office_manager, is_participant, participation_start_at',
    )
    .eq('primary_location_id', sourceLocationId);
  if (staffErr) throw staffErr;
  const sourceStaff = (sourceStaffRaw ?? []) as SourceStaffRow[];

  if (sourceStaff.length === 0) {
    console.error(`Location ${sourceLocationId} has no staff. Pick a location with an active roster.`);
    process.exit(1);
  }
  if (sourceStaff.length < 3) {
    console.error(
      `Location ${sourceLocationId} only has ${sourceStaff.length} staff. The demo needs at least 3 ` +
        `(demo-staff, demo-coach, demo-admin each need a distinct copied person). Pick a bigger location.`,
    );
    process.exit(1);
  }

  const { data: sourceAssignmentsRaw, error: assignErr } = await supabase
    .from('weekly_assignments')
    .select('id, role_id, week_start_date, display_order, action_id, competency_id, self_select')
    .eq('location_id', sourceLocationId)
    .is('superseded_at', null);
  if (assignErr) throw assignErr;
  const sourceAssignments = (sourceAssignmentsRaw ?? []) as (SourceAssignmentRow & { id: string })[];

  if (sourceAssignments.length === 0) {
    console.error(`Location ${sourceLocationId} has no weekly_assignments to copy.`);
    process.exit(1);
  }

  const staffIds = sourceStaff.map((s) => s.id);
  const { data: sourceScoresRaw, error: scoresErr } = await supabase
    .from('weekly_scores')
    .select(
      'staff_id, assignment_id, confidence_score, confidence_date, confidence_late, performance_score, performance_date, performance_late, week_of',
    )
    .in('staff_id', staffIds);
  if (scoresErr) throw scoresErr;
  const sourceScores = (sourceScoresRaw ?? []) as (SourceScoreRow & { staff_id: string; assignment_id: string | null })[];

  // Domain lookup, for the variance pass: assignment -> competency -> domain.
  const { data: competencies, error: compErr } = await supabase
    .from('competencies')
    .select('competency_id, domain_id');
  if (compErr) throw compErr;
  const competencyDomainMap = new Map<number, number>(
    (competencies ?? []).filter((c) => c.domain_id != null).map((c) => [c.competency_id, c.domain_id as number]),
  );

  const actionIds = Array.from(new Set(sourceAssignments.map((a) => a.action_id).filter((id): id is number => id != null)));
  const { data: proMoves, error: pmErr } = actionIds.length
    ? await supabase.from('pro_moves').select('action_id, competency_id').in('action_id', actionIds)
    : { data: [], error: null };
  if (pmErr) throw pmErr;
  const actionCompetencyMap = new Map<number, number>(
    (proMoves ?? []).filter((p) => p.competency_id != null).map((p) => [p.action_id, p.competency_id as number]),
  );

  function resolveDomainId(a: SourceAssignmentRow): number | null {
    const compId = a.competency_id ?? (a.action_id != null ? actionCompetencyMap.get(a.action_id) : undefined) ?? null;
    if (compId == null) return null;
    return competencyDomainMap.get(compId) ?? null;
  }

  // --- 2. Persona selection + anonymize + distribute --------------------------
  // Issue 4: the participant/coach/admin logins are chosen by suitability
  // (role_id present, and for the participant, most recent weekly_scores
  // activity), not by an arbitrary UUID sort. See lib/anonymize.ts
  // selectParticipant/selectCoach/selectAdmin for the exact rule.
  const lastActivityByStaffId = new Map<string, string>();
  for (const score of sourceScores) {
    if (!score.week_of) continue;
    const current = lastActivityByStaffId.get(score.staff_id);
    if (!current || score.week_of > current) lastActivityByStaffId.set(score.staff_id, score.week_of);
  }
  const personaCandidates: PersonaCandidate[] = sourceStaff.map((s) => ({
    id: s.id,
    roleId: s.role_id,
    isCoach: s.is_coach,
    lastActivity: lastActivityByStaffId.get(s.id) ?? null,
  }));

  // assignCast throws (hard-fails) if no candidate is suitable to become
  // the demo-staff (participant) login -- see selectParticipant. That is
  // intentional: Clip 1 depends entirely on this choice, so an unsuitable
  // --source-location must stop the run here, not degrade to a warning.
  const castAssignment = assignCast(personaCandidates, CAST);
  const castBySourceId = new Map(castAssignment.map((c) => [c.sourceId, c.cast]));

  console.log(`Copying ${sourceStaff.length} staff from location ${sourceLocationId}:`);
  for (const { sourceId, cast } of castAssignment) {
    const src = sourceStaff.find((s) => s.id === sourceId)!;
    const roleTag = cast.loginRole ? ` [${cast.loginRole} login]` : '';
    console.log(`  ${src.name} -> ${cast.firstName} ${cast.lastName} (${cast.email})${roleTag}`);
  }

  if (dryRun) {
    console.log(`\nWould create org "${DEMO_ORG.name}" (${DEMO_ORG.slug}), 1 group, 3 locations.`);
    console.log(`Would copy ${sourceAssignments.length} weekly_assignments x 3 locations = ${sourceAssignments.length * 3} demo assignment rows, all status=locked.`);
    console.log(`Would copy ${sourceScores.length} weekly_scores rows (reshaped for variance).`);
    console.log('Would create 3 auth users with known passwords (demo-staff / demo-coach / demo-admin)');
    console.log(`and ${sourceStaff.length - 3 >= 0 ? sourceStaff.length - 3 : sourceStaff.length} more auth users with random, unused passwords.`);
    console.log('Already-existing rows (org/group/locations/staff/assignments/scores, if resuming a');
    console.log('partial previous run) would be detected and skipped, not duplicated.');
    console.log('\nDry run only -- nothing was written.');
    return;
  }

  // --- 3. Org / group / locations (get-or-create, never clobber an existing row) ---
  const demoOrg = await getOrCreateOrg(supabase, sourceOrg?.practice_type ?? 'pediatric');
  const demoGroupId = await getOrCreateGroup(supabase, demoOrg.id);

  // Issue 2 (resumability): anchor every date computation below on the demo
  // org's own created_at, not wall-clock `now`. The org row is the first
  // thing a fresh seed creates and never changes on resume, so every
  // resumed attempt at the same partial seed recomputes the exact same
  // shiftDays / programStartDate as the first attempt -- which is what
  // makes the natural-key get-or-create checks below actually find the
  // earlier attempt's rows instead of creating duplicates with a
  // different week_start_date. `--refresh` (a separate, later operation)
  // is what re-anchors an already-complete org to the real current week.
  const now = new Date(demoOrg.createdAt);

  const programStartDate = shiftDateString(
    mondayInTimezone(ANCHOR_TZ, now),
    -PROGRAM_WEEKS_ELAPSED_AT_SEED * 7,
  );
  const demoLocationIdList: string[] = [];
  for (const loc of DEMO_LOCATIONS) {
    demoLocationIdList.push(await getOrCreateLocation(supabase, demoGroupId, loc, programStartDate));
  }

  // --- 4. Staff + auth users (get-or-create, keyed on the demo email) --------
  const locationForSource = assignLocationRoundRobin(
    sourceStaff.map((s) => ({ id: s.id })),
    demoLocationIdList,
  );

  // One pagination sweep of auth.users, reused for every staff member below
  // instead of re-querying per person. Also lets a resumed run find an auth
  // user a previous, crashed attempt already created (whose staff insert
  // never landed), instead of erroring on a duplicate email.
  const authIdByEmail = await loadAuthUserIdsByEmail(supabase);

  const demoStaffIdBySourceId = new Map<string, string>();
  const demoRoleIdByStaffId = new Map<string, number | null>();
  let staffCreated = 0;
  let staffReused = 0;

  for (const source of sourceStaff) {
    const cast = castBySourceId.get(source.id)!;
    const demoLocationId = locationForSource.get(source.id)!;
    const draft = buildDemoStaffDraft(source, cast, demoLocationId);

    const { data: existingStaff, error: existingStaffErr } = await supabase
      .from('staff')
      .select('id, user_id')
      .eq('email', cast.email)
      .maybeSingle();
    if (existingStaffErr) throw existingStaffErr;

    let demoStaffId: string;
    if (existingStaff) {
      demoStaffId = existingStaff.id;
      staffReused++;
      // Keep structural fields in sync with source on resume/re-run; the
      // identity fields (name/email/user_id) are never touched here.
      const { error: updateErr } = await supabase.from('staff').update(draft).eq('id', demoStaffId);
      if (updateErr) throw updateErr;
    } else {
      const password = cast.loginRole
        ? requireEnv(`DEMO_${cast.loginRole.toUpperCase()}_PASSWORD`)
        : randomUnusedPassword();
      const userId = await getOrCreateAuthUserId(supabase, cast.email, password, authIdByEmail);

      const { data: staffRow, error: staffInsertErr } = await supabase
        .from('staff')
        .insert({ ...draft, user_id: userId })
        .select('id')
        .single();
      if (staffInsertErr) throw staffInsertErr;
      demoStaffId = staffRow.id;
      staffCreated++;
    }

    demoStaffIdBySourceId.set(source.id, demoStaffId);
    demoRoleIdByStaffId.set(demoStaffId, draft.role_id);

    if (cast.loginRole) {
      console.log(`  Login ${existingStaff ? 'reused' : 'created'}: ${cast.email} (${cast.loginRole}) -> staff id ${demoStaffId}`);
    }
  }
  console.log(`Staff: ${staffCreated} created, ${staffReused} already existed and were reused.`);

  // --- 5. weekly_assignments: replicate to all 3 demo locations --------------
  // Get-or-create on the natural key (org, location, role, week, slot), so
  // resuming after a partial previous run reuses rows that already made it
  // in instead of duplicating them.
  const sourceMaxWeek = sourceAssignments.reduce((max, a) => (a.week_start_date > max ? a.week_start_date : max), sourceAssignments[0].week_start_date);
  const shiftDays = computeWeekShiftDays(sourceMaxWeek, now, ANCHOR_TZ);
  console.log(`\nShifting copied weeks by ${shiftDays} day(s) so ${sourceMaxWeek} lands on this week's Monday.`);

  const demoAssignmentIdByKey = new Map<string, string>();
  const domainByAssignmentKey = new Map<string, number | null>();
  let assignmentsCreated = 0;
  let assignmentsReused = 0;

  for (const demoLocationId of demoLocationIdList) {
    for (const src of sourceAssignments) {
      const draft = buildDemoAssignmentDraft(
        { ...src, week_start_date: shiftDateString(src.week_start_date, shiftDays) },
        demoOrg.id,
        demoLocationId,
      );

      const { data: existingAssignment, error: existingAssignErr } = await supabase
        .from('weekly_assignments')
        .select('id, status')
        .eq('org_id', demoOrg.id)
        .eq('location_id', demoLocationId)
        .eq('role_id', draft.role_id)
        .eq('week_start_date', draft.week_start_date)
        .eq('display_order', draft.display_order)
        .is('superseded_at', null)
        .maybeSingle();
      if (existingAssignErr) throw existingAssignErr;

      let assignmentId: string;
      if (existingAssignment) {
        assignmentId = existingAssignment.id;
        assignmentsReused++;
        // Issue 1 defense-in-depth: if a row already occupies this natural
        // key with a non-locked status (should not happen for a demo-seed
        // row, since buildDemoAssignmentDraft always forces 'locked' --
        // but this key could in principle already be occupied by
        // something else), force it locked rather than trusting it.
        if (existingAssignment.status !== 'locked') {
          const { error: fixErr } = await supabase
            .from('weekly_assignments')
            .update({ status: 'locked' })
            .eq('id', assignmentId);
          if (fixErr) throw fixErr;
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('weekly_assignments')
          .insert(draft)
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        assignmentId = inserted.id;
        assignmentsCreated++;
      }

      const key = demoAssignmentKey(demoLocationId, draft.role_id, draft.week_start_date, draft.display_order);
      demoAssignmentIdByKey.set(key, assignmentId);
      domainByAssignmentKey.set(key, resolveDomainId(src));
    }
  }
  console.log(`Assignments: ${assignmentsCreated} created, ${assignmentsReused} already existed and were reused (all locked).`);

  // Also index source assignments by their original id, to resolve each
  // weekly_scores row's assignment_id back to (role_id, week_start_date, display_order).
  const sourceAssignmentById = new Map(sourceAssignments.map((a) => [a.id, a]));

  // --- 6. weekly_scores: map source scores onto the new demo assignments -----
  // Pre-fetch which (staff_id, assignment_id) pairs already exist for this
  // org's staff, so a resumed run skips rows an earlier attempt already
  // wrote instead of duplicating them (weekly_scores has no unique
  // constraint on that pair at the DB level, so this check has to happen
  // here, not via an upsert/onConflict).
  const demoStaffIds = [...demoStaffIdBySourceId.values()];
  const existingScoreKeys = new Set<string>();
  if (demoStaffIds.length > 0) {
    const { data: existingScores, error: existingScoresErr } = await supabase
      .from('weekly_scores')
      .select('staff_id, assignment_id')
      .in('staff_id', demoStaffIds);
    if (existingScoresErr) throw existingScoresErr;
    for (const row of existingScores ?? []) {
      existingScoreKeys.add(`${row.staff_id}|${row.assignment_id}`);
    }
  }

  const demoScoreDrafts: (DemoScoreDraft & { locationId: string; domainId: number | null })[] = [];
  let skipped = 0;
  let scoresAlreadyPresent = 0;

  for (const score of sourceScores) {
    const demoStaffId = demoStaffIdBySourceId.get(score.staff_id);
    if (!demoStaffId) {
      skipped++;
      continue;
    }
    const sourceAssignmentId = (score.assignment_id ?? '').replace(/^assign:/, '');
    const sourceAssignment = sourceAssignmentById.get(sourceAssignmentId);
    if (!sourceAssignment) {
      skipped++;
      continue;
    }
    const demoLocationId = locationForSource.get(score.staff_id)!;
    const shiftedWeek = shiftDateString(sourceAssignment.week_start_date, shiftDays);
    const key = demoAssignmentKey(demoLocationId, sourceAssignment.role_id, shiftedWeek, sourceAssignment.display_order);
    const demoAssignmentId = demoAssignmentIdByKey.get(key);
    if (!demoAssignmentId) {
      skipped++;
      continue;
    }

    if (existingScoreKeys.has(`${demoStaffId}|assign:${demoAssignmentId}`)) {
      scoresAlreadyPresent++;
      continue;
    }

    const shiftedScore: SourceScoreRow = {
      ...score,
      week_of: score.week_of ? shiftDateString(score.week_of, shiftDays) : null,
      confidence_date: score.confidence_date ? shiftIsoDate(score.confidence_date, shiftDays) : null,
      performance_date: score.performance_date ? shiftIsoDate(score.performance_date, shiftDays) : null,
    };

    const draft = buildDemoScoreDraft(shiftedScore, demoStaffId, demoAssignmentId, sourceAssignment.action_id);
    demoScoreDrafts.push({
      ...draft,
      locationId: demoLocationId,
      domainId: domainByAssignmentKey.get(key) ?? null,
    });
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} source score row(s) that could not be mapped to a copied assignment.`);
  }
  if (scoresAlreadyPresent > 0) {
    console.log(`${scoresAlreadyPresent} score row(s) already existed (resumed run) and were left as-is.`);
  }

  // --- 7. Variance pass --------------------------------------------------------
  const domainIds = Array.from(new Set(demoScoreDrafts.map((d) => d.domainId).filter((d): d is number => d != null))).sort(
    (a, b) => a - b,
  );
  const scoreLikes: ScoreLike[] = demoScoreDrafts.map((d) => ({
    staffId: d.staff_id,
    locationId: d.locationId,
    domainId: d.domainId ?? -1,
    weekOf: d.week_of ?? '',
    confidenceScore: d.confidence_score,
  }));
  const shaped = shapeVariance(scoreLikes, domainIds, demoLocationIdList);
  const shapedByIndex = new Map(shaped.map((s, i) => [i, s]));
  demoScoreDrafts.forEach((d, i) => {
    d.confidence_score = shapedByIndex.get(i)!.confidenceScore;
  });

  // --- 8. Guarantee an uncompleted, locked current-week assignment for demo-staff ----
  // Issue 1: this must hard-fail, not warn, if the guarantee can't be met --
  // a warning here previously let the seed "succeed" while Clip 1 had
  // nothing to rate.
  const staffLogin = castAssignment.find((c) => c.cast.loginRole === 'participant');
  if (!staffLogin) {
    throw new Error('No cast member is tagged loginRole "participant" -- check cast.ts.');
  }

  const demoStaffId = demoStaffIdBySourceId.get(staffLogin.sourceId)!;
  const demoLocationId = locationForSource.get(staffLogin.sourceId)!;
  const currentWeek = shiftDateString(sourceMaxWeek, shiftDays);
  const cleared = clearCurrentWeekScore(demoScoreDrafts, demoStaffId, currentWeek);
  cleared.forEach((c, i) => {
    demoScoreDrafts[i].confidence_score = c.confidence_score;
    demoScoreDrafts[i].confidence_date = c.confidence_date;
    demoScoreDrafts[i].confidence_late = c.confidence_late;
    demoScoreDrafts[i].performance_score = c.performance_score;
    demoScoreDrafts[i].performance_date = c.performance_date;
    demoScoreDrafts[i].performance_late = c.performance_late;
  });

  const staffRoleId = demoRoleIdByStaffId.get(demoStaffId);
  // display_order isn't known here (a staff member's role can have slots
  // 1-3), so search all keys for this location/role/week rather than
  // guessing the slot.
  const currentWeekAssignmentStatus =
    staffRoleId != null
      ? [...demoAssignmentIdByKey.keys()]
          .filter((k) => {
            const [locId, roleIdStr, week] = k.split('|');
            return locId === demoLocationId && week === currentWeek && Number(roleIdStr) === staffRoleId;
          })
          .map((k) => ({ key: k, id: demoAssignmentIdByKey.get(k)! }))
      : [];

  if (currentWeekAssignmentStatus.length === 0) {
    throw new Error(
      `Could not create/find a ${currentWeek} weekly_assignments row (status=locked) for demo-staff's ` +
        `role (${staffRoleId}) at location ${demoLocationId}. Clip 1 (staff self-eval) would have ` +
        `nothing to rate. This is a hard failure, not a warning: pick a different --source-location, ` +
        `or check that the source location actually has current-week assignments for this role. ` +
        `The demo org's staff/assignments/scores written so far are safe to leave in place -- ` +
        `re-running this script will resume and skip what already exists.`,
    );
  }

  // Every row that satisfies the search above was built via
  // buildDemoAssignmentDraft, which always forces status: 'locked' (Issue
  // 1's fix), or was an existing row that step 5 force-corrected to
  // 'locked' if it wasn't already. Verify that guarantee explicitly rather
  // than trusting it silently, per the QA request to check status
  // specifically.
  for (const { id } of currentWeekAssignmentStatus) {
    const { data: verifyRow, error: verifyErr } = await supabase
      .from('weekly_assignments')
      .select('status')
      .eq('id', id)
      .maybeSingle();
    if (verifyErr) throw verifyErr;
    if (verifyRow?.status !== 'locked') {
      throw new Error(
        `weekly_assignments row ${id} for demo-staff's current week is status='${verifyRow?.status}', ` +
          `not 'locked'. This should be impossible given buildDemoAssignmentDraft always forces ` +
          `'locked' -- treating as a hard failure rather than letting Clip 1 silently show nothing.`,
      );
    }
  }

  // --- 9. Write scores ----------------------------------------------------------
  const scoreRowsToInsert = demoScoreDrafts.map(({ locationId, domainId, ...row }) => row);
  const BATCH = 500;
  for (let i = 0; i < scoreRowsToInsert.length; i += BATCH) {
    const { error: scoreInsertErr } = await supabase.from('weekly_scores').insert(scoreRowsToInsert.slice(i, i + BATCH));
    if (scoreInsertErr) throw scoreInsertErr;
  }

  // --- 10. Prove the anonymization actually worked -----------------------------
  const sourceNames = sourceStaff.map((s) => s.name);
  const sourceEmails = sourceStaff.map((s) => s.email);
  const leaked = castAssignment.filter(
    ({ cast }) =>
      containsAnySourceIdentity(fullName(cast), sourceNames, sourceEmails) ||
      containsAnySourceIdentity(cast.email, sourceNames, sourceEmails),
  );
  if (leaked.length > 0) {
    console.warn(`WARNING: possible identity leak detected in cast entries: ${leaked.map((l) => l.cast.email).join(', ')}`);
  }

  console.log(`\nDone. Demo org: ${DEMO_ORG.slug} (${demoOrg.id})`);
  console.log(`  ${sourceStaff.length} staff, ${demoAssignmentIdByKey.size} weekly_assignments, ${scoreRowsToInsert.length + scoresAlreadyPresent} weekly_scores.`);
  console.log(`  demo-staff login: ${CAST.find((c) => c.loginRole === 'participant')!.email}`);
  console.log(`  demo-coach login: ${CAST.find((c) => c.loginRole === 'coach')!.email}`);
  console.log(`  demo-admin login: ${CAST.find((c) => c.loginRole === 'admin')!.email}`);
}

// ---------------------------------------------------------------------------
// --refresh: demo org already exists, re-point existing rows
// ---------------------------------------------------------------------------

async function refreshExistingOrg(supabase: SupabaseClient, demoOrgId: string, dryRun: boolean): Promise<void> {
  const { data: assignments, error: assignErr } = await supabase
    .from('weekly_assignments')
    .select('id, week_start_date')
    .eq('org_id', demoOrgId)
    .is('superseded_at', null);
  if (assignErr) throw assignErr;
  if (!assignments || assignments.length === 0) {
    console.log('No weekly_assignments found for the demo org -- nothing to refresh.');
    return;
  }

  const now = new Date();
  const currentMaxWeek = assignments.reduce((max, a) => (a.week_start_date > max ? a.week_start_date : max), assignments[0].week_start_date);
  const shiftDays = computeWeekShiftDays(currentMaxWeek, now, ANCHOR_TZ);

  if (shiftDays === 0) {
    console.log('Already current for this week (shift = 0 days). Nothing to do.');
  } else {
    console.log(`Shifting ${assignments.length} weekly_assignments by ${shiftDays} day(s).`);
  }

  const orgLocationIds = await demoLocationIds(supabase, demoOrgId);

  // Issue 3: --refresh must also shift program_start_date on every demo
  // location, by the same shiftDays, so the legacy cycle/week-in-cycle
  // position (still read by some legacy code, and still backed by NOT
  // NULL columns on `locations`) stays exactly where it was set at seed
  // time. Without this, only week_start_date/week_of moved forward while
  // program_start_date stood still, so the location's cycle position
  // drifted forward every refresh and would eventually land on week 1 of
  // a cycle -- the "just onboarded" state -- no matter how mid-program it
  // started. See lib/refreshWeek.ts#weekInCycle and its tests for the
  // invariant this preserves.
  let locations: { id: string; program_start_date: string }[] = [];
  if (orgLocationIds.length > 0) {
    const { data: locationRows, error: locationsErr } = await supabase
      .from('locations')
      .select('id, program_start_date')
      .in('id', orgLocationIds);
    if (locationsErr) throw locationsErr;
    locations = locationRows ?? [];
  }

  // Issue 5: guard the empty-array case explicitly (Supabase's `.in()`
  // with an empty array is a real query that always returns zero rows,
  // but there is no reason to send it -- freshSeed's queries already
  // short-circuit the same way).
  let orgStaffIds: string[] = [];
  if (orgLocationIds.length > 0) {
    const { data: orgStaff, error: orgStaffErr } = await supabase
      .from('staff')
      .select('id')
      .in('primary_location_id', orgLocationIds);
    if (orgStaffErr) throw orgStaffErr;
    orgStaffIds = (orgStaff ?? []).map((s) => s.id);
  }

  let scores: { id: string; week_of: string | null; confidence_date: string | null; performance_date: string | null; staff_id: string | null }[] = [];
  if (orgStaffIds.length > 0) {
    const { data: scoreRows, error: scoresErr } = await supabase
      .from('weekly_scores')
      .select('id, week_of, confidence_date, performance_date, staff_id')
      .in('staff_id', orgStaffIds);
    if (scoresErr) throw scoresErr;
    scores = scoreRows ?? [];
  }

  if (dryRun) {
    console.log(`Would update ${assignments.length} weekly_assignments and ${scores.length} weekly_scores.`);
    console.log(`Would shift program_start_date on ${locations.length} location(s) by the same ${shiftDays} day(s).`);
    console.log('Would sync the 3 login passwords from env vars.');
    console.log('\nDry run only -- nothing was written.');
    return;
  }

  if (shiftDays !== 0) {
    for (const a of assignments) {
      const { error } = await supabase
        .from('weekly_assignments')
        .update({ week_start_date: shiftDateString(a.week_start_date, shiftDays) })
        .eq('id', a.id);
      if (error) throw error;
    }
    for (const s of scores) {
      const { error } = await supabase
        .from('weekly_scores')
        .update({
          week_of: s.week_of ? shiftDateString(s.week_of, shiftDays) : null,
          confidence_date: s.confidence_date ? shiftIsoDate(s.confidence_date, shiftDays) : null,
          performance_date: s.performance_date ? shiftIsoDate(s.performance_date, shiftDays) : null,
        })
        .eq('id', s.id);
      if (error) throw error;
    }
    for (const loc of locations) {
      const { error } = await supabase
        .from('locations')
        .update({ program_start_date: shiftDateString(loc.program_start_date, shiftDays) })
        .eq('id', loc.id);
      if (error) throw error;
    }
  }

  // Re-clear the participant login's current-week score, and sync passwords.
  const participantEmail = CAST.find((c) => c.loginRole === 'participant')!.email;
  const { data: participantStaff, error: pErr } = await supabase
    .from('staff')
    .select('id, user_id')
    .eq('email', participantEmail)
    .maybeSingle();
  if (pErr) throw pErr;
  if (participantStaff) {
    const newCurrentWeek = shiftDateString(currentMaxWeek, shiftDays);
    await supabase
      .from('weekly_scores')
      .update({
        confidence_score: null,
        confidence_date: null,
        confidence_late: null,
        performance_score: null,
        performance_date: null,
        performance_late: null,
      })
      .eq('staff_id', participantStaff.id)
      .eq('week_of', newCurrentWeek);
  }

  for (const role of ['participant', 'coach', 'admin'] as const) {
    const cast = CAST.find((c) => c.loginRole === role)!;
    const password = requireEnv(`DEMO_${role.toUpperCase()}_PASSWORD`);
    const { data: loginStaff } = await supabase.from('staff').select('user_id').eq('email', cast.email).maybeSingle();
    if (loginStaff?.user_id) {
      const { error } = await supabase.auth.admin.updateUserById(loginStaff.user_id, { password });
      if (error) console.warn(`Could not sync password for ${cast.email}: ${error.message}`);
    }
  }

  console.log('Refresh complete.');
}

async function demoLocationIds(supabase: SupabaseClient, demoOrgId: string): Promise<string[]> {
  const { data: groups } = await supabase.from('practice_groups').select('id').eq('organization_id', demoOrgId);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length === 0) return [];
  const { data: locations } = await supabase.from('locations').select('id').in('group_id', groupIds);
  return (locations ?? []).map((l) => l.id);
}

// ---------------------------------------------------------------------------
// Auth admin helpers
// ---------------------------------------------------------------------------

/**
 * One full pagination sweep of auth.users, mapping lowercased email -> id.
 * Loaded once per script run and reused for every staff member, both for
 * efficiency (this is a service-role project-wide listing, not scoped to
 * the demo org) and for resumability (Issue 2): a crashed previous run may
 * have created an auth user whose staff row never landed, and looking it
 * up here before calling createUser again avoids a duplicate-email error.
 */
async function loadAuthUserIdsByEmail(supabase: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return map;
}

/** Looks up `email` in the pre-loaded map before ever calling createUser. */
async function getOrCreateAuthUserId(
  supabase: SupabaseClient,
  email: string,
  password: string,
  authIdByEmail: Map<string, string>,
): Promise<string> {
  const existing = authIdByEmail.get(email.toLowerCase());
  if (existing) return existing;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { demo_seed: true, demo_org_slug: DEMO_ORG.slug },
  });
  if (createErr) throw new Error(`auth.admin.createUser(${email}) failed: ${createErr.message}`);
  const userId = created.user!.id;
  authIdByEmail.set(email.toLowerCase(), userId);
  return userId;
}

// ---------------------------------------------------------------------------
// get-or-create helpers -- select first, insert only if missing, never
// overwrite an existing row's identity-bearing fields on re-run.
// ---------------------------------------------------------------------------

interface DemoOrgRef {
  id: string;
  createdAt: string;
}

async function getOrCreateOrg(supabase: SupabaseClient, practiceType: string): Promise<DemoOrgRef> {
  const { data: existing, error: existingErr } = await supabase
    .from('organizations')
    .select('id, created_at')
    .eq('slug', DEMO_ORG.slug)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) return { id: existing.id, createdAt: existing.created_at };

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: DEMO_ORG.name,
      slug: DEMO_ORG.slug,
      app_display_name: DEMO_ORG.appDisplayName,
      practice_type: practiceType === 'general' ? 'general' : 'pediatric',
    })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { id: data.id, createdAt: data.created_at };
}

async function getOrCreateGroup(supabase: SupabaseClient, orgId: string): Promise<string> {
  const { data: existing } = await supabase.from('practice_groups').select('id').eq('slug', DEMO_GROUP.slug).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('practice_groups')
    .insert({
      name: DEMO_GROUP.name,
      slug: DEMO_GROUP.slug,
      organization_id: orgId,
      active: true,
      is_sandbox: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function getOrCreateLocation(
  supabase: SupabaseClient,
  groupId: string,
  loc: (typeof DEMO_LOCATIONS)[number],
  programStartDate: string,
): Promise<string> {
  const { data: existing } = await supabase.from('locations').select('id').eq('slug', loc.slug).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('locations')
    .insert({
      name: loc.name,
      slug: loc.slug,
      group_id: groupId,
      timezone: loc.timezone,
      program_start_date: programStartDate,
      cycle_length_weeks: CYCLE_LENGTH_WEEKS,
      active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// ---------------------------------------------------------------------------
// Date helpers local to this file
// ---------------------------------------------------------------------------

/** Shifts the date portion of an ISO timestamp string by `shiftDays`, keeping the time-of-day. */
function shiftIsoDate(isoStr: string, shiftDays: number): string {
  if (shiftDays === 0) return isoStr;
  const [datePart, ...rest] = isoStr.split('T');
  const shiftedDate = shiftDateString(datePart, shiftDays);
  return rest.length > 0 ? `${shiftedDate}T${rest.join('T')}` : shiftedDate;
}

main().catch((err) => {

  console.error('\nDEMO-1a seed failed:');
  console.error(err);
  process.exit(1);
});

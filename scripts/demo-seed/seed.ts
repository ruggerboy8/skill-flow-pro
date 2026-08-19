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
    .select('id, role_id, week_start_date, display_order, action_id, competency_id, status, self_select')
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

  // --- 2. Anonymize + distribute ---------------------------------------------
  const castAssignment = assignCast(
    sourceStaff.map((s) => ({ id: s.id })),
    CAST,
  );
  const castBySourceId = new Map(castAssignment.map((c) => [c.sourceId, c.cast]));

  console.log(`Copying ${sourceStaff.length} staff from location ${sourceLocationId}:`);
  for (const { sourceId, cast } of castAssignment) {
    const src = sourceStaff.find((s) => s.id === sourceId)!;
    console.log(`  ${src.name} -> ${cast.firstName} ${cast.lastName} (${cast.email})`);
  }

  if (dryRun) {
    console.log(`\nWould create org "${DEMO_ORG.name}" (${DEMO_ORG.slug}), 1 group, 3 locations.`);
    console.log(`Would copy ${sourceAssignments.length} weekly_assignments x 3 locations = ${sourceAssignments.length * 3} demo assignment rows.`);
    console.log(`Would copy ${sourceScores.length} weekly_scores rows (reshaped for variance).`);
    console.log('Would create 3 auth users with known passwords (demo-staff / demo-coach / demo-admin)');
    console.log(`and ${sourceStaff.length - 3 >= 0 ? sourceStaff.length - 3 : sourceStaff.length} more auth users with random, unused passwords.`);
    console.log('\nDry run only -- nothing was written.');
    return;
  }

  // --- 3. Org / group / locations (get-or-create, never clobber an existing row) ---
  const demoOrgId = await getOrCreateOrg(supabase, sourceOrg?.practice_type ?? 'pediatric');
  const demoGroupId = await getOrCreateGroup(supabase, demoOrgId);

  const now = new Date();
  const programStartDate = shiftDateString(
    mondayInTimezone(ANCHOR_TZ, now),
    -PROGRAM_WEEKS_ELAPSED_AT_SEED * 7,
  );
  const demoLocationIds: string[] = [];
  for (const loc of DEMO_LOCATIONS) {
    demoLocationIds.push(await getOrCreateLocation(supabase, demoGroupId, loc, programStartDate));
  }

  // --- 4. Staff + auth users --------------------------------------------------
  const locationForSource = assignLocationRoundRobin(
    sourceStaff.map((s) => ({ id: s.id })),
    demoLocationIds,
  );

  const demoStaffIdBySourceId = new Map<string, string>();
  const demoRoleIdByStaffId = new Map<string, number | null>();
  for (const source of sourceStaff) {
    const cast = castBySourceId.get(source.id)!;
    const demoLocationId = locationForSource.get(source.id)!;
    const draft = buildDemoStaffDraft(source, cast, demoLocationId);
    const password = cast.loginRole
      ? requireEnv(`DEMO_${cast.loginRole.toUpperCase()}_PASSWORD`)
      : randomUnusedPassword();

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: cast.email,
      password,
      email_confirm: true,
      user_metadata: { demo_seed: true, demo_org_slug: DEMO_ORG.slug },
    });
    if (authErr) throw new Error(`auth.admin.createUser(${cast.email}) failed: ${authErr.message}`);
    const userId = authUser.user!.id;

    const { data: staffRow, error: staffInsertErr } = await supabase
      .from('staff')
      .insert({ ...draft, user_id: userId })
      .select('id')
      .single();
    if (staffInsertErr) throw staffInsertErr;

    demoStaffIdBySourceId.set(source.id, staffRow.id);
    demoRoleIdByStaffId.set(staffRow.id, draft.role_id);

    if (cast.loginRole) {
      console.log(`  Login created: ${cast.email} (${cast.loginRole}) -> staff id ${staffRow.id}`);
    }
  }

  // --- 5. weekly_assignments: replicate to all 3 demo locations --------------
  const sourceMaxWeek = sourceAssignments.reduce((max, a) => (a.week_start_date > max ? a.week_start_date : max), sourceAssignments[0].week_start_date);
  const shiftDays = computeWeekShiftDays(sourceMaxWeek, now, ANCHOR_TZ);
  console.log(`\nShifting copied weeks by ${shiftDays} day(s) so ${sourceMaxWeek} lands on this week's Monday.`);

  const demoAssignmentIdByKey = new Map<string, string>();
  const domainByAssignmentKey = new Map<string, number | null>();

  for (const demoLocationId of demoLocationIds) {
    for (const src of sourceAssignments) {
      const draft = buildDemoAssignmentDraft(
        { ...src, week_start_date: shiftDateString(src.week_start_date, shiftDays) },
        demoOrgId,
        demoLocationId,
      );
      const { data: inserted, error: insertErr } = await supabase
        .from('weekly_assignments')
        .insert(draft)
        .select('id')
        .single();
      if (insertErr) throw insertErr;

      const key = demoAssignmentKey(demoLocationId, draft.role_id, draft.week_start_date, draft.display_order);
      demoAssignmentIdByKey.set(key, inserted.id);
      domainByAssignmentKey.set(key, resolveDomainId(src));
    }
  }

  // Also index source assignments by their original id, to resolve each
  // weekly_scores row's assignment_id back to (role_id, week_start_date, display_order).
  const sourceAssignmentById = new Map(sourceAssignments.map((a) => [a.id, a]));

  // --- 6. weekly_scores: map source scores onto the new demo assignments -----
  const demoScoreDrafts: (DemoScoreDraft & { locationId: string; domainId: number | null })[] = [];
  let skipped = 0;

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
  const shaped = shapeVariance(scoreLikes, domainIds, demoLocationIds);
  const shapedByIndex = new Map(shaped.map((s, i) => [i, s]));
  demoScoreDrafts.forEach((d, i) => {
    d.confidence_score = shapedByIndex.get(i)!.confidenceScore;
  });

  // --- 8. Guarantee an uncompleted current-week assignment for demo-staff ----
  const staffLoginId = castAssignment.find((c) => c.cast.loginRole === 'participant');
  if (staffLoginId) {
    const demoStaffId = demoStaffIdBySourceId.get(staffLoginId.sourceId)!;
    const demoLocationId = locationForSource.get(staffLoginId.sourceId)!;
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
    const hasCurrentWeekAssignment =
      staffRoleId != null &&
      [...demoAssignmentIdByKey.keys()].some((k) => {
        const [locId, roleIdStr, week] = k.split('|');
        return locId === demoLocationId && week === currentWeek && Number(roleIdStr) === staffRoleId;
      });
    if (!hasCurrentWeekAssignment) {
      console.warn(
        `WARNING: could not confirm a ${currentWeek} weekly_assignments row exists for demo-staff's ` +
          `role at location ${demoLocationId}. Clip 1 (staff self-eval) may not have anything to rate. ` +
          `Check the source location's current-week assignments for this role.`,
      );
    }
  } else {
    console.warn('WARNING: no cast member is tagged loginRole "participant" -- check cast.ts.');
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

  console.log(`\nDone. Demo org: ${DEMO_ORG.slug} (${demoOrgId})`);
  console.log(`  ${sourceStaff.length} staff, ${demoAssignmentIdByKey.size} weekly_assignments, ${scoreRowsToInsert.length} weekly_scores.`);
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
  const { data: orgStaff, error: orgStaffErr } = await supabase
    .from('staff')
    .select('id')
    .in('primary_location_id', orgLocationIds);
  if (orgStaffErr) throw orgStaffErr;
  const orgStaffIds = (orgStaff ?? []).map((s) => s.id);

  const { data: scores, error: scoresErr } = await supabase
    .from('weekly_scores')
    .select('id, week_of, confidence_date, performance_date, staff_id')
    .in('staff_id', orgStaffIds);
  if (scoresErr) throw scoresErr;

  if (dryRun) {
    console.log(`Would update ${assignments.length} weekly_assignments and ${scores?.length ?? 0} weekly_scores.`);
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
    for (const s of scores ?? []) {
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
// get-or-create helpers -- select first, insert only if missing, never
// overwrite an existing row's identity-bearing fields on re-run.
// ---------------------------------------------------------------------------

async function getOrCreateOrg(supabase: SupabaseClient, practiceType: string): Promise<string> {
  const { data: existing } = await supabase.from('organizations').select('id').eq('slug', DEMO_ORG.slug).maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: DEMO_ORG.name,
      slug: DEMO_ORG.slug,
      app_display_name: DEMO_ORG.appDisplayName,
      practice_type: practiceType === 'general' ? 'general' : 'pediatric',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
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

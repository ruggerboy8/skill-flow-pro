import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { format, addWeeks, startOfWeek, addDays } from 'https://esm.sh/date-fns@3.6.0';
import { formatInTimeZone, fromZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

// Sequencer engine version (bump when algorithm changes)
const RANK_VERSION = 'v3.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RolloverRequest {
  roles?: number[];
  asOf?: string;
  dryRun?: boolean;
  force?: boolean;
  proposeOnly?: boolean;
  regenerateNextWeek?: boolean;  // Force re-pick next week
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RolloverRequest = await req.json();
    const { roles = [1, 2], asOf, dryRun = false, force = false, proposeOnly = false, regenerateNextWeek = false } = body;

    const logs: string[] = [];
    logs.push(`[Global Rollover] Starting for roles: ${roles.join(', ')}`);
    
    // Check global gate: has any location reached C3W6?
    if (!force) {
      const gateOpen = await checkGlobalGate(supabase, logs);
      if (!gateOpen) {
        logs.push('[Global Rollover] Gate closed: no location at C3W6 yet');
        return new Response(
          JSON.stringify({ 
            status: 'waiting_for_first_location',
            message: 'Progress gate not met (C3W6)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Global Rollover] Gate open ✓');
    }

    // Get global timezone from app_kv
    const { data: tzData } = await supabase
      .from('app_kv')
      .select('value')
      .eq('key', 'sequencer:global_timezone')
      .maybeSingle();

    const globalTz = (tzData?.value as any)?.timezone || 'America/Chicago';
    logs.push(`[Global Rollover] Using timezone: ${globalTz}`);

    const now = asOf ? new Date(asOf) : new Date();
    
    // Check if we're at Mon 12:01 AM in global timezone (or in force mode)
    if (!force && !asOf) {
      const localDay = formatInTimeZone(now, globalTz, 'i');
      const localHour = parseInt(formatInTimeZone(now, globalTz, 'H'), 10);
      const localMinute = parseInt(formatInTimeZone(now, globalTz, 'm'), 10);
      
      if (localDay !== '1' || localHour !== 0 || localMinute < 1) {
        logs.push(`[Global Rollover] Not rollover time (day=${localDay}, hour=${localHour}, min=${localMinute})`);
        return new Response(
          JSON.stringify({ 
            status: 'not_rollover_time',
            message: 'Not rollover time (Mon 12:01 AM global time)', 
            logs 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      logs.push('[Global Rollover] Rollover time confirmed ✓');
    }

    // Calculate Monday anchors in global TZ
    const mondayZ = toZonedStart(now, globalTz);
    const currentWeekStr = format(mondayZ, 'yyyy-MM-dd');
    const nextWeekStr = format(addWeeks(mondayZ, 1), 'yyyy-MM-dd');

    logs.push(`[Global Rollover] Weeks: Current=${currentWeekStr}, Next=${nextWeekStr}`);

    const results = [];

    for (const roleId of roles) {
      const roleLogs: string[] = [];
      try {
        // Step 1: Lock current week (skip if proposeOnly)
        if (!proposeOnly) {
          roleLogs.push(`[Lock This Week] Locking ${currentWeekStr} for role ${roleId}`);
          
          // First, check what exists
          const { data: existingCurrent, error: checkError } = await supabase
            .from('weekly_plan')
            .select('id, status')
            .is('org_id', null)
            .eq('role_id', roleId)
            .eq('week_start_date', currentWeekStr);

          console.log(`[Lock This Week] Query result:`, { count: existingCurrent?.length, existingCurrent, checkError });
          roleLogs.push(`[Lock This Week] Found ${existingCurrent?.length || 0} existing rows`);

          if (!existingCurrent || existingCurrent.length === 0) {
            // First week after gate - generate it as locked
            roleLogs.push(`[Lock This Week] No existing week found - generating locked plan`);
            if (!dryRun) {
              await generateWeekPlan(supabase, null, roleId, currentWeekStr, globalTz, false, 'locked', roleLogs);
            }
          } else if (existingCurrent.every(row => row.status === 'locked')) {
            // Already locked - normal steady state
            roleLogs.push(`[Lock This Week] Week is already locked (${existingCurrent.length} rows) ✓`);
          } else {
            // Has proposed rows - lock them
            const proposedRows = existingCurrent.filter(row => row.status === 'proposed');
            roleLogs.push(`[Lock This Week] Found ${proposedRows.length} proposed rows to lock`);
            
            if (!dryRun) {
              console.log(`[Lock This Week] Attempting UPDATE:`, {
                org_id: null,
                role_id: roleId,
                week_start_date: currentWeekStr,
                current_status: 'proposed',
                new_status: 'locked',
                expected_rows: proposedRows.length
              });

              const { data: updateData, error: lockError, count } = await supabase
                .from('weekly_plan')
                .update({ status: 'locked', locked_at: new Date().toISOString() })
                .is('org_id', null)
                .eq('role_id', roleId)
                .eq('week_start_date', currentWeekStr)
                .eq('status', 'proposed')
                .select('*', { count: 'exact' });

              console.log(`[Lock This Week] UPDATE result:`, { updateData, lockError, count });

              if (lockError) {
                roleLogs.push(`[Lock This Week] ERROR: ${lockError.message}`);
                console.error(`[Lock This Week] Full error:`, lockError);
                throw new Error(`Failed to lock week: ${lockError.message}`);
              }
              
              // Assert we locked the expected number of rows
              if (count !== proposedRows.length) {
                roleLogs.push(`[Lock This Week] WARNING: Expected to lock ${proposedRows.length} rows but locked ${count}`);
                console.warn(`[Lock This Week] Row count mismatch`, { expected: proposedRows.length, actual: count });
              } else {
                roleLogs.push(`[Lock This Week] Locked ${count} rows successfully ✓`);
              }
              
              // If we didn't lock exactly 3, warn loudly
              if (count !== 3) {
                roleLogs.push(`[Lock This Week] ⚠️ PARTIAL WEEK: Expected 3 rows, locked ${count}`);
              }
            } else {
              roleLogs.push('[Lock This Week] Skipped (dry run)');
            }
          }
        } else {
          roleLogs.push('[Lock This Week] Skipped (proposeOnly mode)');
        }

        // Step 2: Ensure next week plan (preserve if complete, unless forced)
        roleLogs.push(`[Ensure Next Week] Checking ${nextWeekStr}`);
        let rankSnapshot: any = null;
        let generatedPicks: number[] = [];
        let wroteCount = 0;
        let preserved = false;

        if (!dryRun) {
          const ensureResult = await ensureWeekPlan({
            supabase,
            roleId,
            weekStartDate: nextWeekStr,
            timezone: globalTz,
            status: 'proposed',
            regenerate: regenerateNextWeek,
            logs: roleLogs
          });
          
          rankSnapshot = ensureResult.rankSnapshot;
          generatedPicks = ensureResult.picks;
          wroteCount = ensureResult.wroteCount;
          preserved = ensureResult.preserved;

          if (preserved) {
            roleLogs.push(`[Ensure Next Week] ✅ Preserved existing complete week`);
          } else if (wroteCount > 0) {
            roleLogs.push(`[Ensure Next Week] ✅ Regenerated ${wroteCount} slots`);
          }
        } else {
          roleLogs.push('[Ensure Next Week] Skipped (dry run)');
        }

        // Log to sequencer_runs with enhanced metadata (non-fatal)
        if (!dryRun) {
          try {
            console.log(`[sequencer_runs] Attempting INSERT with org_id=NULL, mode=global_cron`);
            const { data: runData, error: runError } = await supabase
              .from('sequencer_runs')
              .insert({
                org_id: null,
                role_id: roleId,
                target_week_start: currentWeekStr,
                mode: 'global_cron',
                success: true,
                as_of: asOf || new Date().toISOString(),
                picks: generatedPicks.length > 0 ? { top3: generatedPicks } : null,
                weights: rankSnapshot?.weights || null,
                rank_version: RANK_VERSION,
                notes: JSON.stringify({
                  currentWeekLocked: !proposeOnly,
                  nextWeek: {
                    preserved,
                    regenerated: !preserved && wroteCount > 0,
                    reason: preserved ? 'complete' : (regenerateNextWeek ? 'forced' : (wroteCount > 0 ? 'incomplete' : 'none'))
                  },
                  wroteCount
                }),
                logs: roleLogs.slice(0, 50), // Limit log size
                run_at: new Date().toISOString()
              })
              .select();
            
            console.log(`[sequencer_runs] INSERT result:`, { runData, runError });
            
            if (runError) {
              console.warn(`[sequencer_runs] Non-fatal logging error:`, runError);
              roleLogs.push(`[sequencer_runs] Logging failed (non-fatal): ${runError.message}`);
            } else {
              roleLogs.push(`[sequencer_runs] Logged run successfully ✓`);
            }
          } catch (logError: any) {
            console.warn('[sequencer_runs] Exception during logging (non-fatal):', logError);
            roleLogs.push(`[sequencer_runs] Exception (non-fatal): ${logError.message}`);
          }
        }

        results.push({
          roleId,
          status: 'success',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          wroteCount,
          picks: generatedPicks,
          mode: proposeOnly ? 'proposeOnly' : 'rollover',
          logs: roleLogs
        });

      } catch (error: any) {
        console.error(`[Global Rollover] Error for role ${roleId}:`, error);
        roleLogs.push(`[ERROR] ${error.message}`);
        
        if (!dryRun) {
          console.log(`[sequencer_runs] Logging error run with org_id=NULL`);
          const { data: runData, error: runError } = await supabase
            .from('sequencer_runs')
            .insert({
              org_id: null,
              role_id: roleId,
              target_week_start: currentWeekStr,
              mode: 'global_cron',
              success: false,
              error_message: error.message,
              logs: roleLogs,
              run_at: new Date().toISOString()
            })
            .select();
          
          console.log(`[sequencer_runs] Error run INSERT result:`, { runData, runError });
        }

        results.push({
          roleId,
          status: 'error',
          currentWeek: currentWeekStr,
          nextWeek: nextWeekStr,
          error: error.message,
          logs: roleLogs
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, dryRun, results, logs }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Global Rollover] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Check if any active location globally has reached C3W6
async function checkGlobalGate(supabase: any, logs: string[]): Promise<boolean> {
  const { data: locations } = await supabase
    .from('locations')
    .select('id, program_start_date, cycle_length_weeks, timezone')
    .eq('active', true);

  if (!locations || locations.length === 0) {
    logs.push('[Gate] No active locations found');
    return false;
  }

  for (const loc of locations) {
    const programStartDate = new Date(loc.program_start_date);
    const cycleLength = loc.cycle_length_weeks;
    const now = new Date();
    
    const daysDiff = Math.floor((now.getTime() - programStartDate.getTime()) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysDiff / 7);
    const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
    const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
    
    if (cycleNumber === 3 && weekInCycle === 6) {
      logs.push(`[Gate] Location ${loc.id} at C3W6 ✓`);
      return true;
    }
  }

  logs.push('[Gate] No locations at C3W6 yet');
  return false;
}

// Calculate Monday anchor in timezone
function toZonedStart(now: Date, tz: string): Date {
  const isoDow = parseInt(formatInTimeZone(now, tz, 'i'), 10);
  const todayMidnightUtc = fromZonedTime(
    `${formatInTimeZone(now, tz, 'yyyy-MM-dd')}T00:00:00`,
    tz
  );
  return addDays(todayMidnightUtc, -(isoDow - 1));
}

// Fetch week plan rows for analysis
async function fetchWeekPlan(
  supabase: any,
  roleId: number,
  weekStart: string
) {
  return supabase
    .from('weekly_plan')
    .select('id, action_id, display_order, status, overridden, rank_snapshot, rank_version, generated_by')
    .is('org_id', null)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStart)
    .order('display_order');
}

// Analyze week completeness
function analyzeWeek(existing: any[] | null) {
  const rows = existing ?? [];
  const count = rows.length;
  const isComplete = count === 3;
  const hasOverrides = rows.some(r => r.overridden === true);
  const overriddenSlots = new Set(
    rows.filter(r => r.overridden).map(r => r.display_order)
  );
  return { count, isComplete, hasOverrides, overriddenSlots, rows };
}

// Ensure week has a valid plan (preserve complete weeks, regenerate incomplete)
async function ensureWeekPlan({
  supabase,
  roleId,
  weekStartDate,
  timezone,
  status = 'proposed',
  regenerate = false,
  logs = []
}: {
  supabase: any;
  roleId: number;
  weekStartDate: string;
  timezone: string;
  status?: 'proposed' | 'locked';
  regenerate?: boolean;
  logs?: string[];
}): Promise<{ picks: number[]; rankSnapshot: any; wroteCount: number; preserved: boolean }> {
  
  // Step 1: Fetch and analyze existing week
  const { data: existing, error: fetchError } = await fetchWeekPlan(supabase, roleId, weekStartDate);
  if (fetchError) {
    logs.push(`[ensureWeekPlan] Fetch error: ${fetchError.message}`);
    throw fetchError;
  }

  const { isComplete, hasOverrides, overriddenSlots, rows } = analyzeWeek(existing);
  logs.push(`[ensureWeekPlan] ${weekStartDate} analysis: ${rows.length} rows, complete=${isComplete}, hasOverrides=${hasOverrides}`);

  // Step 2: Preservation check
  if (!regenerate && isComplete) {
    logs.push(`[ensureWeekPlan] ✅ Preserving complete week (3/3 rows)`);
    const existingPicks = rows.map(r => r.action_id);
    const existingSnapshot = rows[0]?.rank_snapshot || null;
    return { 
      picks: existingPicks, 
      rankSnapshot: existingSnapshot, 
      wroteCount: 0,
      preserved: true 
    };
  }

  // Step 3: Determine regeneration reason
  let regenReason = '';
  if (regenerate) {
    regenReason = 'forced (regenerateNextWeek=true)';
  } else if (!isComplete) {
    regenReason = `incomplete (${rows.length}/3 rows)`;
  }
  logs.push(`[ensureWeekPlan] 🔄 Regenerating: ${regenReason}`);

  // Step 4: Delete non-overridden rows only
  const toDelete = rows.filter(r => !r.overridden).map(r => r.id);
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('weekly_plan')
      .delete()
      .in('id', toDelete);
    
    if (delErr) {
      logs.push(`[ensureWeekPlan] Delete error: ${delErr.message}`);
      throw delErr;
    }
    logs.push(`[ensureWeekPlan] Deleted ${toDelete.length} non-overridden rows`);
  }

  // Step 5: Calculate open slots (slots not overridden)
  const openSlots = [1, 2, 3].filter(s => !overriddenSlots.has(s));
  logs.push(`[ensureWeekPlan] Open slots: [${openSlots.join(',')}]`);

  if (openSlots.length === 0) {
    logs.push(`[ensureWeekPlan] All slots overridden, no regeneration needed`);
    return { picks: [], rankSnapshot: null, wroteCount: 0, preserved: false };
  }

  // Step 6: Call sequencer-rank for fresh picks
  const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
    body: {
      roleId,
      effectiveDate: weekStartDate,
      timezone
    }
  });

  if (rankError) {
    logs.push(`[ensureWeekPlan] Rank error: ${rankError.message}`);
    throw new Error(`Failed to rank moves: ${rankError.message}`);
  }

  const nextPicks = rankData?.next || [];
  if (nextPicks.length === 0) {
    logs.push(`[ensureWeekPlan] No moves ranked`);
    throw new Error('Sequencer returned no moves');
  }

  // Step 7: Take top N picks for open slots
  const picksForSlots = nextPicks.slice(0, openSlots.length).map((m: any) => m.proMoveId);
  logs.push(`[ensureWeekPlan] Picks for open slots: [${picksForSlots.join(',')}]`);

  // Build rank snapshot
  const top3Full = nextPicks.slice(0, 3).map((m: any) => m.proMoveId);
  const top5 = nextPicks.slice(0, 5).map((m: any) => m.proMoveId);
  const rankSnapshot = {
    top3: top3Full,
    top5,
    poolSize: rankData.ranked?.length || 0,
    weights: nextPicks[0]?.parts || null,
    version: RANK_VERSION
  };

  // Step 8: Insert rows for open slots
  const insertRows = openSlots.map((slot, i) => ({
    org_id: null,
    role_id: roleId,
    week_start_date: weekStartDate,
    display_order: slot,
    action_id: picksForSlots[i],
    self_select: false,
    status,
    generated_by: 'auto',
    overridden: false,
    rank_version: RANK_VERSION,
    rank_snapshot: rankSnapshot
  }));

  const { data: insertData, error: insertError, count } = await supabase
    .from('weekly_plan')
    .insert(insertRows)
    .select('*', { count: 'exact' });

  if (insertError) {
    logs.push(`[ensureWeekPlan] Insert error: ${insertError.message}`);
    throw insertError;
  }

  const actualCount = count ?? insertData?.length ?? 0;
  logs.push(`[ensureWeekPlan] ✅ Wrote ${actualCount} new rows`);

  return { 
    picks: picksForSlots, 
    rankSnapshot, 
    wroteCount: actualCount,
    preserved: false 
  };
}

// Generate a week's plan (global: org_id = null)
// Returns: { picks: number[], rankSnapshot: any, wroteCount: number }
async function generateWeekPlan(
  supabase: any, 
  orgId: string | null,
  roleId: number, 
  weekStartDate: string, 
  timezone: string,
  respectOverride: boolean = true,
  status: 'proposed' | 'locked' = 'proposed',
  logs: string[] = []
): Promise<{ picks: number[]; rankSnapshot: any; wroteCount: number } | null> {
  // Check if week is overridden
  if (respectOverride) {
    const { data: existing } = await supabase
      .from('weekly_plan')
      .select('id, overridden')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', weekStartDate)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].overridden) {
      logs.push(`[generateWeekPlan] Week ${weekStartDate} is overridden, skipping`);
      return null;
    }
  }

  // Check for incomplete weeks (1-2 rows that aren't overridden)
  const { data: incompleteCheck, count: incompleteCount } = await supabase
    .from('weekly_plan')
    .select('*', { count: 'exact' })
    .is('org_id', null)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate);

  if (incompleteCount && incompleteCount > 0 && incompleteCount < 3) {
    logs.push(`[generateWeekPlan] Found incomplete week (${incompleteCount} rows), will rebuild`);
  }

  // Call sequencer-rank to get ranked moves
  const { data: rankData, error: rankError } = await supabase.functions.invoke('sequencer-rank', {
    body: {
      roleId,
      effectiveDate: weekStartDate,
      timezone
    }
  });

  if (rankError) {
    logs.push(`[generateWeekPlan] Rank error: ${rankError.message}`);
    throw new Error(`Failed to rank moves: ${rankError.message}`);
  }

  const nextPicks = rankData?.next || [];
  logs.push(`[generateWeekPlan] Ranked ${nextPicks.length} moves from sequencer-rank`);
  
  if (nextPicks.length === 0) {
    logs.push(`[generateWeekPlan] No moves ranked for ${weekStartDate}`);
    return null;
  }

  // Build rank snapshot with full provenance
  const top3 = nextPicks.slice(0, 3);
  const picks = top3.map((m: any) => m.proMoveId);
  const top5 = nextPicks.slice(0, 5).map((m: any) => m.proMoveId);
  
  const rankSnapshot = {
    top3: picks,
    top5,
    poolSize: rankData.ranked?.length || 0,
    weights: top3[0]?.parts || null,
    version: RANK_VERSION
  };

  logs.push(`[generateWeekPlan] Rank snapshot: top3=[${picks.join(',')}], pool=${rankSnapshot.poolSize}`);

  // Delete existing plan for this week (if not overridden)
  const { error: deleteError } = await supabase
    .from('weekly_plan')
    .delete()
    .is('org_id', null)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate)
    .neq('overridden', true);

  if (deleteError) {
    logs.push(`[generateWeekPlan] Delete error: ${deleteError.message}`);
  }

  // Insert new plan with full provenance (global: org_id = NULL)
  const planRows = top3.map((pick: any, index: number) => ({
    org_id: null,
    role_id: roleId,
    week_start_date: weekStartDate,
    display_order: index + 1,
    action_id: pick.proMoveId,
    self_select: false,
    status,
    generated_by: 'auto',
    overridden: false,
    rank_version: RANK_VERSION,
    rank_snapshot: rankSnapshot
  }));

  console.log(`[generateWeekPlan] Attempting INSERT with provenance:`, planRows);

  const { data: insertData, error: insertError, count } = await supabase
    .from('weekly_plan')
    .insert(planRows)
    .select('*', { count: 'exact' });

  console.log(`[generateWeekPlan] INSERT result:`, { insertData, insertError, count });

  if (insertError) {
    logs.push(`[generateWeekPlan] ERROR: ${insertError.message}`);
    console.error(`[generateWeekPlan] Full insert error:`, insertError);
    throw new Error(`Failed to insert plan: ${insertError.message}`);
  }

  // Use insertData length as fallback if count is null
  const actualCount = count !== null ? count : (insertData?.length || 0);

  // Verify we inserted exactly 3 rows
  if (actualCount !== 3) {
    logs.push(`[generateWeekPlan] ⚠️ PARTIAL WEEK: Expected 3 rows, got ${actualCount}`);
    console.warn(`[generateWeekPlan] Row count mismatch`, { expected: 3, actual: actualCount, countWasNull: count === null });
  } else {
    logs.push(`[generateWeekPlan] ✅ Wrote ${actualCount} rows successfully`);
  }

  logs.push(`[generateWeekPlan] Generated ${actualCount} moves for ${weekStartDate} (status: ${status}) ✓`);
  
  return { picks, rankSnapshot, wroteCount: actualCount };
}

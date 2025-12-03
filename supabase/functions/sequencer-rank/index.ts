import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Collective Weakness constants
const LOW_CUTOFF = 2; // 1-4 scale: ≤2 is "low confidence"
const MIN_SAMPLES = 12; // Minimum staff-weeks to trust signals
const BETA_PRIOR_A = 3; // Beta prior for low-rate EB
const BETA_PRIOR_B = 3;

// Recency constants
const RECENCY_HORIZON = 16; // Fixed horizon
const TRICKLE_LONG = 24; // Long-tail bonus threshold
const TRICKLE_WEIGHT = 0.20; // Long-tail contribution weight

interface RankRequest {
  roleId: 1 | 2;
  // New planner contract
  asOfWeek?: string;
  lookbackWeeks?: number;
  preset?: 'balanced' | 'confidence_recovery' | 'eval_focus' | 'variety_first';
  constraints?: {
    minDistinctDomains?: number;
    cooldownWeeks?: number;
    excludeMoveIds?: number[];
  };
  // Legacy fields (backward compatible)
  effectiveDate?: string;
  timezone?: string;
  weights?: { C: number; R: number; E: number; D: number };
  cooldownWeeks?: number;
  diversityMinDomainsPerWeek?: number;
  recencyHorizonWeeks?: number;
  ebPrior?: number;
  ebK?: number;
  trimPct?: number;
  evalCap?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const body: RankRequest = await req.json();

    // Support both new planner contract and legacy contract
    const timezone = body.timezone || 'America/Chicago';
    const effectiveDate = body.asOfWeek || body.effectiveDate || new Date().toISOString().split('T')[0];
    const lookbackWeeks = body.lookbackWeeks ?? 9;
    const preset = body.preset || 'balanced';
    
    // Map presets to weights
    const presetWeights: Record<string, { C: number; R: number; E: number; D: number }> = {
      balanced: { C: 0.55, R: 0.25, E: 0.15, D: 0.05 },
      confidence_recovery: { C: 0.70, R: 0.15, E: 0.10, D: 0.05 },
      eval_focus: { C: 0.40, R: 0.20, E: 0.35, D: 0.05 },
      variety_first: { C: 0.45, R: 0.20, E: 0.05, D: 0.30 },
    };
    
    // Use preset weights if no custom weights provided
    let weights = body.weights || presetWeights[preset] || presetWeights.balanced;
    const receivedWeights = JSON.stringify(body.weights || preset);
    const sum = weights.C + weights.R + weights.E + weights.D;
    if (Math.abs(sum - 1.0) > 0.001) {
      weights = {
        C: weights.C / sum,
        R: weights.R / sum,
        E: weights.E / sum,
        D: weights.D / sum,
      };
    }

    // Primary reason thresholds
    const LOW_CONF_THRESHOLD = 0.30;
    const STALE_WEEKS = 6;

    const config = {
      weights,
      cooldownWeeks: body.constraints?.cooldownWeeks ?? body.cooldownWeeks ?? 4,
      diversityMinDomainsPerWeek: body.constraints?.minDistinctDomains ?? body.diversityMinDomainsPerWeek ?? 2,
      recencyHorizonWeeks: body.recencyHorizonWeeks ?? RECENCY_HORIZON,
      ebPrior: body.ebPrior ?? 0.70,
      ebK: body.ebK ?? 20,
      trimPct: body.trimPct ?? 0.05,
      evalCap: body.evalCap ?? 0.25,
      excludeMoveIds: body.constraints?.excludeMoveIds ?? [],
    };

    const logs: string[] = [];
    const rankVersion = 'v4.1-unified'; // Updated version after unification
    const rulesApplied: string[] = [
      `cooldown=${config.cooldownWeeks}w`,
      `minDistinctDomains=${config.diversityMinDomainsPerWeek}`,
      `lookback=${lookbackWeeks}w`,
    ];
    
    logs.push(`Starting ranking for role ${body.roleId} on ${effectiveDate} (${preset})`);
    logs.push(`Received: ${receivedWeights}`);
    logs.push(`Normalized weights: C=${weights.C.toFixed(3)}, R=${weights.R.toFixed(3)}, E=${weights.E.toFixed(3)}, D=${weights.D.toFixed(3)}`);
    if (weights.R === 0) {
      logs.push('Recency disabled (wR=0) - cooldown and diversity still apply');
    }

    // Calculate cutoff dates
    const effectiveDateObj = new Date(effectiveDate);
    const cutoffLookback = new Date(effectiveDateObj);
    cutoffLookback.setDate(cutoffLookback.getDate() - lookbackWeeks * 7);
    const cutoff8w = new Date(effectiveDateObj);
    cutoff8w.setDate(cutoff8w.getDate() - 8 * 7);

    // 1. Fetch eligible moves with competencies
    const { data: eligibleMoves, error: movesError } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competency_id')
      .eq('active', true)
      .eq('role_id', body.roleId);

    if (movesError) throw movesError;

    // 1b. Fetch competencies with domains separately
    const competencyIds = eligibleMoves?.map((m: any) => m.competency_id) || [];
    const { data: competencies, error: compError } = await supabase
      .from('competencies')
      .select('competency_id, domain_id, domains!competencies_domain_id_fkey(domain_name)')
      .in('competency_id', competencyIds);

    if (compError) throw compError;

    // Build competency lookup map
    const competencyMap = new Map(
      competencies?.map((c: any) => [
        c.competency_id,
        { domainId: c.domain_id, domainName: c.domains.domain_name }
      ]) || []
    );

    let eligible = eligibleMoves?.map((m: any) => {
      const comp = competencyMap.get(m.competency_id);
      return {
        id: m.action_id,
        name: m.action_statement,
        competencyId: m.competency_id,
        domainId: comp?.domainId || 0,
        domainName: comp?.domainName || 'Unknown',
      };
    }) || [];

    // Apply exclusions
    if (config.excludeMoveIds.length > 0) {
      eligible = eligible.filter(m => !config.excludeMoveIds.includes(m.id));
      logs.push(`Excluded ${config.excludeMoveIds.length} moves, ${eligible.length} remaining`);
    }

    logs.push(`Found ${eligible.length} eligible moves`);

    // Helper: classify confidence status
    const classifyConfidence = (
      confEB: number,
      recent: { avg: number; n: number }[]
    ): { status: 'critical'|'watch'|'ok'; severity?: number; n2w?: number; recentMeans?: number[] } => {
      const lastTwo = recent.slice(-2);
      const n2w = lastTwo.reduce((s,r)=>s+(r?.n||0), 0);
      const recentMeans = lastTwo.map(r => r?.avg ?? 0);

      const isCritical = confEB <= 0.20 && n2w >= 10;
      if (isCritical) {
        const severity = Math.max(0, Math.min(1, (0.25 - confEB) / 0.25));
        return { status: 'critical', severity, n2w, recentMeans };
      }

      const anyVeryLow = lastTwo.some(r => (r?.avg ?? 1) <= 0.20 && (r?.n ?? 0) >= 5);
      const isWatch = confEB <= 0.30 || anyVeryLow;
      if (isWatch) return { status: 'watch', n2w, recentMeans };

      return { status: 'ok', n2w, recentMeans };
    };

    // 2. Fetch confidence history (lookback weeks) - handle weekly_focus, weekly_plan, and weekly_assignments
    // Note: We explicitly select columns to avoid PostgREST auto-join attempts
    const { data: confData, error: confError } = await supabase
      .from('weekly_scores')
      .select('confidence_score, confidence_date, weekly_focus_id, assignment_id')
      .not('confidence_score', 'is', null)
      .gte('confidence_date', cutoffLookback.toISOString());

    if (confError) throw confError;

    logs.push(`Fetched ${confData?.length || 0} confidence scores`);

    // Parse weekly_focus_id and assignment_id to get action_id
    // NOTE: We KEEP this ID mapping logic for the 186 legacy scores still linked via weekly_focus_id
    const focusIdToActionId = new Map<string, number>();
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // Collect all unique focus IDs and assignment IDs
    const allFocusIds = [...new Set(confData?.map((r: any) => r.weekly_focus_id).filter(Boolean))];
    const allAssignmentIds = [...new Set(confData?.map((r: any) => r.assignment_id).filter(Boolean))];
    
    // Split focus IDs into UUID and plan:XXX formats
    const uuidIds = allFocusIds.filter(id => uuidPattern.test(id));
    const planIds = allFocusIds
      .filter(id => id.startsWith('plan:'))
      .map(id => id.replace('plan:', ''));

    // Split assignment IDs into assign:XXX format
    const assignIds = allAssignmentIds
      .filter(id => id.startsWith('assign:'))
      .map(id => id.replace('assign:', ''));

    // Batch fetch action_ids from weekly_focus (Cycles 1-3) - for SCORE resolution only
    if (uuidIds.length > 0) {
      const { data: focusRows } = await supabase
        .from('weekly_focus')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', uuidIds);
      
      focusRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(row.id, row.action_id);
      });
      logs.push(`Mapped ${focusRows?.length || 0} weekly_focus IDs to action_ids (for score resolution)`);
    }

    // Batch fetch action_ids from weekly_plan (Cycle 4+) - for SCORE resolution only
    if (planIds.length > 0) {
      const { data: planRows } = await supabase
        .from('weekly_plan')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', planIds);
      
      planRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(`plan:${row.id}`, row.action_id);
      });
      logs.push(`Mapped ${planRows?.length || 0} weekly_plan IDs to action_ids (for score resolution)`);
    }

    // Batch fetch action_ids from weekly_assignments (V2) - for SCORE resolution only
    if (assignIds.length > 0) {
      const { data: assignRows } = await supabase
        .from('weekly_assignments')
        .select('id, action_id')
        .eq('role_id', body.roleId)
        .in('id', assignIds);
      
      assignRows?.forEach((row: any) => {
        if (row.action_id) focusIdToActionId.set(`assign:${row.id}`, row.action_id);
      });
      logs.push(`Mapped ${assignRows?.length || 0} weekly_assignments IDs to action_ids (for score resolution)`);
    }

    // Group by pro_move and week
    const confidenceMap = new Map<string, { sum: number; count: number }>();
    confData?.forEach((row: any) => {
      // Try assignment_id first (V2), then fall back to weekly_focus_id (V1)
      const lookupKey = row.assignment_id || row.weekly_focus_id;
      const actionId = focusIdToActionId.get(lookupKey);
      if (!actionId) return; // Skip if we couldn't map to action_id
      
      const weekStart = new Date(row.confidence_date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      const key = `${actionId}-${weekStart.toISOString().split('T')[0]}`;
      const existing = confidenceMap.get(key) || { sum: 0, count: 0 };
      confidenceMap.set(key, {
        // PHASE 1 FIX: Correct confidence normalization (1→0%, 2→33%, 3→67%, 4→100%)
        sum: existing.sum + (row.confidence_score - 1) / 3.0,
        count: existing.count + 1,
      });
    });

    const confidenceHistory = Array.from(confidenceMap.entries()).map(([key, val]) => {
      // Split only on first dash to preserve date format (e.g., "4-2025-10-27")
      const dashIndex = key.indexOf('-');
      const proMoveId = key.substring(0, dashIndex);
      const weekStart = key.substring(dashIndex + 1);
      return {
        proMoveId: Number(proMoveId),
        weekStart,
        avg: val.sum / val.count,
        n: val.count,
      };
    });

    logs.push(`Collected ${confidenceHistory.length} confidence data points`);

    // Track individual low-confidence counts (scores ≤ 2 on 1-4 scale)
    const individualLowCounts = new Map<number, { lowCount: number; totalCount: number }>();
    confData?.forEach((row: any) => {
      const lookupKey = row.assignment_id || row.weekly_focus_id;
      const actionId = focusIdToActionId.get(lookupKey);
      if (!actionId) return;
      
      const existing = individualLowCounts.get(actionId) || { lowCount: 0, totalCount: 0 };
      const isLow = row.confidence_score <= 2; // 1-4 scale
      individualLowCounts.set(actionId, {
        lowCount: existing.lowCount + (isLow ? 1 : 0),
        totalCount: existing.totalCount + 1
      });
    });

    // 3. Fetch latest quarterly evals (Alcan-wide per role)
    const { data: evalData, error: evalError } = await supabase.rpc(
      'seq_latest_quarterly_evals',
      { role_id_arg: body.roleId }
    );
    if (evalError) console.warn('Eval fetch failed:', evalError);

    const evals = evalData?.map((e: any) => ({
      competencyId: e.competency_id,
      score: e.score, // already 0..1
    })) || [];

    logs.push(`Found ${evals.length} eval scores`);

    // 4. Fetch last selected - UNIFIED: only query weekly_assignments (single source of truth)
    const { data: lastSelectedAssign, error: lsAssignError } = await supabase
      .from('weekly_assignments')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .order('week_start_date', { ascending: false });

    if (lsAssignError) throw lsAssignError;

    // Build map from unified source (keep most recent per action_id)
    const lastSelectedMap = new Map<number, string>();
    lastSelectedAssign?.forEach((row: any) => {
      if (!lastSelectedMap.has(row.action_id)) {
        lastSelectedMap.set(row.action_id, row.week_start_date);
      }
    });

    const lastSelected = Array.from(lastSelectedMap.entries()).map(([proMoveId, weekStart]) => ({
      proMoveId,
      weekStart,
    }));

    logs.push(`Last selected records: ${lastSelectedAssign?.length || 0} from weekly_assignments, ${lastSelected.length} unique moves`);
    
    // Log never-seen moves
    const neverSeen = eligible.filter(m => !lastSelected.some(ls => ls.proMoveId === m.id));
    logs.push(`Never assigned moves: ${neverSeen.length} (e.g., ${neverSeen.slice(0, 3).map(m => m.name).join(', ')})`);
    
    // Log sample confidence data
    logs.push(`Total confidence records: ${confidenceHistory.length}`);
    const movesWithConf = new Set(confidenceHistory.map(c => c.proMoveId));
    logs.push(`Moves with confidence data: ${movesWithConf.size}/${eligible.length}`);

    // 5. Fetch domain coverage (last 8 weeks) - UNIFIED: only query weekly_assignments
    const { data: domainCoverageAssign, error: dcAssignError } = await supabase
      .from('weekly_assignments')
      .select('action_id, week_start_date')
      .eq('role_id', body.roleId)
      .not('action_id', 'is', null)
      .not('week_start_date', 'is', null)
      .gte('week_start_date', cutoff8w.toISOString().split('T')[0]);

    if (dcAssignError) throw dcAssignError;

    const domainCoverageMap = new Map<number, Set<string>>();
    domainCoverageAssign?.forEach((row: any) => {
      const move = eligible.find(m => m.id === row.action_id);
      if (move) {
        const weeks = domainCoverageMap.get(move.domainId) || new Set();
        weeks.add(row.week_start_date);
        domainCoverageMap.set(move.domainId, weeks);
      }
    });

    const domainCoverage = Array.from(domainCoverageMap.entries()).map(([domainId, weeks]) => ({
      domainId,
      appearances: weeks.size,
    }));

    logs.push(`Domain coverage: ${domainCoverage.length} domains tracked (${domainCoverageAssign?.length || 0} records from weekly_assignments)`);

    // Add sample move logging
    if (eligible.length > 0) {
      logs.push(`Sample move for introspection: ${eligible[0].name} (id=${eligible[0].id})`);
    }

    // Import and run engine (inline for now since we can't import from src/)
    // We'll compute directly here
    const inputs = {
      eligibleMoves: eligible,
      confidenceHistory,
      evals,
      lastSelected,
      domainCoverage,
      effectiveDate,
      timezone,
    };

    // Score function
    const scoreCandidate = (move: any, referenceDate: string) => {
    // C (Collective Weakness) - combines tail pain + mean deficit
    const confData = confidenceHistory.filter(h => h.proMoveId === move.id);
    let smoothedConf = config.ebPrior;
    let p_low = 0.5; // Default to neutral
    let C = 0.5; // Default to neutral
    let avgConfLast: number | null = null;
    let lowConfShare: number | null = null;

    if (confData.length > 0) {
      // PHASE 1 FIX: Add safety guard for trimming to prevent NaN
      const trimCount = Math.floor(confData.length * config.trimPct);
      // Safety: ensure at least 1 element remains after trimming
      const safeTrimCount = Math.min(trimCount, Math.floor((confData.length - 1) / 2));
      const sorted = confData.map(d => d.avg).sort((a, b) => a - b);
      const trimmed = sorted.slice(safeTrimCount, sorted.length - safeTrimCount);
      
      // Fallback if trimmed is empty (shouldn't happen with safeTrimCount, but guard anyway)
      const sampleMean = trimmed.length > 0 
        ? trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length
        : sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
      const totalN = confData.reduce((sum, d) => sum + d.n, 0);
      
      // EB smoothed mean
      smoothedConf = (config.ebPrior * config.ebK + sampleMean * totalN) / (config.ebK + totalN);
      
      // Use full lookback window average for UI (convert 0-1 back to 1-4 scale)
      avgConfLast = sampleMean * 3 + 1; // Convert 0-1 to 1-4 scale
      
      // Calculate low-tail rate using individual confidence scores
      const individualCounts = individualLowCounts.get(move.id) || { lowCount: 0, totalCount: 0 };
      
      // Beta EB: (a + low_count) / (a + b + total_count)
      p_low = (BETA_PRIOR_A + individualCounts.lowCount) / (BETA_PRIOR_A + BETA_PRIOR_B + individualCounts.totalCount);
      lowConfShare = p_low; // Store for UI
      
      // Collective Weakness: 60% tail pain + 40% mean deficit
      const mean_deficit = 1 - smoothedConf;
      C = 0.6 * p_low + 0.4 * mean_deficit;
      
      // Sample-size adjustment: shrink toward neutral if n < MIN_SAMPLES
      if (totalN < MIN_SAMPLES) {
        const lambda = Math.max(0, Math.min(1, totalN / MIN_SAMPLES));
        C = lambda * C + (1 - lambda) * 0.5;
      }
    }

    // R (Recency) - Linear post-cooldown + long-trickle tail
    const lastSeenRecord = lastSelected.find(ls => ls.proMoveId === move.id);
    const weeksSince = lastSeenRecord
      ? Math.floor((new Date(referenceDate).getTime() - new Date(lastSeenRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
      : 999;

    const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
    const cooldown = config.cooldownWeeks;

    // Base recency (linear post-cooldown)
    let R = weeksSince <= cooldown ? 0
          : weeksSince >= horizon  ? 1
          : (weeksSince - cooldown) / (horizon - cooldown);

    // Long-trickle tail (ancient moves get a small bonus)
    const R_long = Math.min(weeksSince / TRICKLE_LONG, 1) * TRICKLE_WEIGHT;
    R = Math.min(R + R_long, 1); // Cap at 1

    // PHASE 2: Retest logic removed - hardcode to disabled
    const retestDue = false;

      // E (Eval) - Deficit with capped contribution
      const evalRecord = evals.find(e => e.competencyId === move.competencyId);
      const evalScore01 = evalRecord?.score; // 0..1 (1=good, undefined=no data)
      const E_raw = evalScore01 == null ? 0 : Math.max(0, 1 - evalScore01); // deficit
      const eContrib = Math.min(E_raw * weights.E, config.evalCap); // cap contribution

      // D (Domain)
      const domainRecord = domainCoverage.find(dc => dc.domainId === move.domainId);
      const appearances = domainRecord ? domainRecord.appearances : 0;
      const D = 1 - Math.min(appearances / 8, 1);

    // T (Retest Boost) - PHASE 2: Hardcoded to 0 (logic removed)
    const T = 0;

    // Determine primary reason (server-side)
    let primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE' = 'TIE';
    let primaryReasonValue: number | null = null;

    // PHASE 2: Removed RETEST check since retestDue is always false
    if (lowConfShare !== null && lowConfShare >= LOW_CONF_THRESHOLD) {
      primaryReasonCode = 'LOW_CONF';
      primaryReasonValue = lowConfShare;
    } else if (weeksSince === 999) {
      primaryReasonCode = 'NEVER';
    } else if (weeksSince >= STALE_WEEKS) {
      primaryReasonCode = 'STALE';
      primaryReasonValue = weeksSince;
    }

      const final = (C * weights.C) + (R * weights.R) + (D * weights.D) + eContrib + T;

      const components = [
        { key: 'C', value: C * weights.C },
        { key: 'R', value: R * weights.R },
        { key: 'E', value: eContrib },
        { key: 'D', value: D * weights.D },
        { key: 'T', value: T },
      ];
      components.sort((a, b) => b.value - a.value);
      const drivers = components.slice(0, 2).map(c => c.key);

    return { 
      C, R, E: E_raw, D, eContrib, final, drivers, weeksSince, T,
      lowConfShare, avgConfLast, retestDue,
      primaryReasonCode, primaryReasonValue
    };
    };

    // Compute Next
    const scored = eligible.map(move => ({ ...move, ...scoreCandidate(move, effectiveDate) }));
    
    // Enhanced deterministic tie-breaks: finalScore → lowConfShare → lastPracticedWeeks desc → actionId asc
    scored.sort((a, b) => {
      // 1. Final score desc
      if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
      // 2. Low confidence share desc (higher = more problematic)
      if ((b.lowConfShare || 0) !== (a.lowConfShare || 0)) return (b.lowConfShare || 0) - (a.lowConfShare || 0);
      // 3. Weeks since practiced desc (longer = higher priority)
      if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
      // 4. ID asc (deterministic)
      return a.id - b.id;
    });

    // Log sample breakdown
    if (scored.length > 0) {
      const sample = scored[0];
      logs.push(`Sample breakdown [${sample.name}]:`);
      logs.push(`  Raw: C=${sample.C.toFixed(3)}, R=${sample.R.toFixed(3)}, E_raw=${sample.E.toFixed(3)}, D=${sample.D.toFixed(3)}, T=${sample.T.toFixed(3)}`);
      logs.push(`  Weighted: C*w=${(sample.C * weights.C).toFixed(3)}, R*w=${(sample.R * weights.R).toFixed(3)}, E_contrib=${sample.eContrib.toFixed(3)}, D*w=${(sample.D * weights.D).toFixed(3)}, T=${sample.T.toFixed(3)}`);
      logs.push(`  Final: ${sample.final.toFixed(3)}, Drivers: ${sample.drivers.join(', ')}`);
    }

    // Apply cooldown and pick top 6 for planner
    const eligibleNext = scored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const nextPicks = [];
    const usedDomains = new Set<number>();
    let relaxedConstraintNote: string | null = null;

    if (eligibleNext.length > 0) {
      nextPicks.push(eligibleNext[0]);
      usedDomains.add(eligibleNext[0].domainId);
    }

    // Pick up to 6 with diversity preference
    for (let i = 1; i < eligibleNext.length && nextPicks.length < 6; i++) {
      const candidate = eligibleNext[i];
      if (usedDomains.size < config.diversityMinDomainsPerWeek && usedDomains.has(candidate.domainId)) {
        continue;
      }
      nextPicks.push(candidate);
      usedDomains.add(candidate.domainId);
    }

    // Relax diversity if needed to reach 6
    if (nextPicks.length < 6) {
      logs.push('Relaxing diversity constraint to complete Top 6');
      relaxedConstraintNote = 'Not enough candidates under current constraints; diversity requirements were relaxed to complete Top 6.';
      for (let i = 1; i < eligibleNext.length && nextPicks.length < 6; i++) {
        if (!nextPicks.find(p => p.id === eligibleNext[i].id)) {
          nextPicks.push(eligibleNext[i]);
        }
      }
    }
    
    // If still under 6, note it
    if (nextPicks.length < 6) {
      relaxedConstraintNote = `Only ${nextPicks.length} candidates available after applying cooldown. Consider reducing cooldown weeks or expanding the pro-move library.`;
    }

    // Compute Preview (advance state)
    const previewDate = new Date(effectiveDateObj);
    previewDate.setDate(previewDate.getDate() + 7);
    const previewDateStr = previewDate.toISOString().split('T')[0];

    // Clone and advance lastSelected for preview
    const advancedLastSelected = lastSelected
      .filter(ls => !nextPicks.find(p => p.id === ls.proMoveId))
      .concat(nextPicks.map(p => ({ proMoveId: p.id, weekStart: effectiveDate })));

    // Score all moves for preview
    const scoreWithAdvanced = (move: any) => {
      const advancedRecord = advancedLastSelected.find(ls => ls.proMoveId === move.id);
      const weeksSince = advancedRecord
        ? Math.floor((new Date(previewDateStr).getTime() - new Date(advancedRecord.weekStart).getTime()) / (7 * 24 * 60 * 60 * 1000))
        : 999;

      const base = scoreCandidate(move, previewDateStr);
      
      // Recalculate R with advanced state
      const horizon = config.recencyHorizonWeeks === 0 ? 12 : config.recencyHorizonWeeks;
      const cooldown = config.cooldownWeeks;
      let R = weeksSince <= cooldown ? 0
            : weeksSince >= horizon  ? 1
            : (weeksSince - cooldown) / (horizon - cooldown);
      const R_long = Math.min(weeksSince / TRICKLE_LONG, 1) * TRICKLE_WEIGHT;
      R = Math.min(R + R_long, 1);

      const final = (base.C * weights.C) + (R * weights.R) + (base.D * weights.D) + base.eContrib + base.T;
      
      return { ...base, R, final, weeksSince };
    };

    const previewScored = eligible.map(move => ({ ...move, ...scoreWithAdvanced(move) }));
    previewScored.sort((a, b) => {
      if (Math.abs(b.final - a.final) >= 0.0001) return b.final - a.final;
      if ((b.lowConfShare || 0) !== (a.lowConfShare || 0)) return (b.lowConfShare || 0) - (a.lowConfShare || 0);
      if (a.weeksSince !== b.weeksSince) return b.weeksSince - a.weeksSince;
      return a.id - b.id;
    });

    const previewEligible = previewScored.filter(m => m.weeksSince >= config.cooldownWeeks);
    const previewPicks = [];
    const previewUsedDomains = new Set<number>();

    if (previewEligible.length > 0) {
      previewPicks.push(previewEligible[0]);
      previewUsedDomains.add(previewEligible[0].domainId);
    }

    for (let i = 1; i < previewEligible.length && previewPicks.length < 6; i++) {
      const candidate = previewEligible[i];
      if (previewUsedDomains.size < config.diversityMinDomainsPerWeek && previewUsedDomains.has(candidate.domainId)) {
        continue;
      }
      previewPicks.push(candidate);
      previewUsedDomains.add(candidate.domainId);
    }

    if (previewPicks.length < 6) {
      for (let i = 1; i < previewEligible.length && previewPicks.length < 6; i++) {
        if (!previewPicks.find(p => p.id === previewEligible[i].id)) {
          previewPicks.push(previewEligible[i]);
        }
      }
    }

    logs.push(`Completed ranking: Next ${nextPicks.length} picks, Preview ${previewPicks.length} picks`);

    // Format response (new planner format)
    const formatRow = (m: any, rank: number) => ({
      rank,
      proMoveId: m.id,
      name: m.name,
      domainId: m.domainId,
      domainName: m.domainName,
      parts: {
        C: m.C,
        R: m.R,
        E: m.E,
        D: m.D,
        T: m.T,
      },
      finalScore: m.final,
      drivers: m.drivers,
      lastSeen: lastSelected.find(ls => ls.proMoveId === m.id)?.weekStart || null,
      weeksSinceSeen: m.weeksSince,
      confidenceN: confidenceHistory.filter(h => h.proMoveId === m.id).reduce((sum, h) => sum + h.n, 0),
      status: classifyConfidence(m.C, confidenceHistory.filter(h => h.proMoveId === m.id)).status,
      lowConfShare: m.lowConfShare,
      avgConfLast: m.avgConfLast,
      lastPracticedWeeks: m.weeksSince,
      retestDue: m.retestDue,
      primaryReasonCode: m.primaryReasonCode,
      primaryReasonValue: m.primaryReasonValue,
    });

    // New planner response format
    const plannerResponse = {
      meta: {
        rankVersion,
        asOfWeek: effectiveDate,
        roleId: body.roleId,
        preset,
        rulesApplied,
        relaxedConstraintNote,
      },
      next: nextPicks.map((m, i) => formatRow(m, i + 1)),
      preview: previewPicks.map((m, i) => formatRow(m, i + 1)),
      full: scored.slice(0, 50).map((m, i) => formatRow(m, i + 1)),
      logs,
    };

    // Legacy response format for backward compatibility
    const legacyResponse = {
      ranked: scored.map((m, i) => ({
        rank: i + 1,
        proMoveId: m.id,
        name: m.name,
        domainId: m.domainId,
        domainName: m.domainName,
        parts: { C: m.C, R: m.R, E: m.E, D: m.D, T: m.T },
        finalScore: m.final,
        drivers: m.drivers,
        lastSeen: lastSelected.find(ls => ls.proMoveId === m.id)?.weekStart || null,
        weeksSinceSeen: m.weeksSince,
        confidenceN: confidenceHistory.filter(h => h.proMoveId === m.id).reduce((sum, h) => sum + h.n, 0),
        status: classifyConfidence(m.C, confidenceHistory.filter(h => h.proMoveId === m.id)).status,
        lowConfShare: m.lowConfShare,
        avgConfLast: m.avgConfLast,
        lastPracticedWeeks: m.weeksSince,
        retestDue: m.retestDue,
        primaryReasonCode: m.primaryReasonCode,
        primaryReasonValue: m.primaryReasonValue,
      })),
      next: nextPicks.map((m, i) => formatRow(m, i + 1)),
      preview: previewPicks.map((m, i) => formatRow(m, i + 1)),
      logs,
      meta: {
        rankVersion,
        asOfWeek: effectiveDate,
        roleId: body.roleId,
        preset,
        rulesApplied,
        relaxedConstraintNote,
      },
    };

    // Return combined response (supports both new and legacy consumers)
    return new Response(
      JSON.stringify({ ...legacyResponse, ...plannerResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import type { OrgInputs, RoleId } from './sequencer-types.ts';

interface FetchParams {
  role: RoleId;
  effectiveDate: Date;
  timezone: string;
  cutoff?: Date;
}

export async function fetchAlcanInputsForRole(params: FetchParams): Promise<OrgInputs> {
  const { role, effectiveDate, timezone, cutoff } = params;
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  // Fetch eligible moves
  const movesRes = await fetch(
    `${supabaseUrl}/rest/v1/pro_moves?role_id=eq.${role}&active=eq.true&select=action_id,action_statement,competency_id,competencies(domain_id)`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  const movesData = await movesRes.json();
  
  const eligibleMoves = movesData.map((m: any) => ({
    id: m.action_id,
    name: m.action_statement,
    domainId: m.competencies?.domain_id || 0,
    competencyId: m.competency_id,
    active: true,
  }));

  // Fetch confidence history (18w, exclude current week if cutoff provided)
  const confRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/seq_confidence_history_18w`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_org_id: null,
        p_role_id: role,
        p_tz: timezone,
        p_effective_date: cutoff ? cutoff.toISOString() : effectiveDate.toISOString(),
      }),
    }
  );
  const confData = await confRes.json();
  
  const confidenceHistory = (confData || []).map((c: any) => ({
    proMoveId: c.pro_move_id,
    weekStart: c.week_start,
    avg01: c.avg01,
    n: c.n,
  }));

  // Fetch evals
  const evalRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/seq_latest_quarterly_evals`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_org_id: null,
        p_role_id: role,
      }),
    }
  );
  const evalData = await evalRes.json();
  
  const evals = (evalData || []).map((e: any) => ({
    staffId: e.staff_id,
    competencyId: e.competency_id,
    avgObserver01: e.avg_observer_01,
    evalCount: e.eval_count,
  }));

  // Fetch last selected
  const lastRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/seq_last_selected_by_move`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_org_id: null,
        p_role_id: role,
        p_tz: timezone,
      }),
    }
  );
  const lastData = await lastRes.json();
  
  const lastSelected = (lastData || []).map((l: any) => ({
    proMoveId: l.pro_move_id,
    weekStart: l.week_start,
  }));

  // Fetch domain coverage
  const domainRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/seq_domain_coverage_8w`,
    {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_org_id: null,
        p_role_id: role,
        p_tz: timezone,
        p_effective_date: cutoff ? cutoff.toISOString() : effectiveDate.toISOString(),
      }),
    }
  );
  const domainData = await domainRes.json();
  
  const domainCoverage8w = (domainData || []).map((d: any) => ({
    domainId: d.domain_id,
    weeksCounted: d.weeks_counted,
    appearances: d.appearances,
  }));

  return {
    eligibleMoves,
    confidenceHistory,
    evals,
    lastSelected,
    domainCoverage8w,
  };
}

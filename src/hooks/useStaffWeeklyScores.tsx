import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawScoreRow, StaffWeekSummary } from '@/types/coachV2';
import { aggregateStaffWeekSummary } from '@/lib/coachUtils';
import { buildRequiredCountResolver, type RequiredMoveAssignment } from '@/lib/requiredMoves';
import { useSim } from '@/devtools/SimProvider';

interface UseStaffWeeklyScoresOptions {
  weekOf?: string | null;
}

/**
 * DASH-5: fetch the week's locked assignments + the group→org map, and build
 * the required-count resolver that tells the aggregator each person's real
 * workload. Throws on failure - a dashboard rendering made-up denominators
 * is worse than a visible error (that's the bug this replaces).
 */
async function fetchRequiredCountResolver(weekOf: string, rows: RawScoreRow[]) {
  const groupIds = [...new Set(rows.map(r => r.group_id).filter(Boolean))];

  const [assignRes, groupRes] = await Promise.all([
    supabase
      .from('weekly_assignments')
      .select('role_id, org_id, location_id, self_select')
      .eq('week_start_date', weekOf)
      .eq('status', 'locked')
      .is('superseded_at', null),
    groupIds.length > 0
      ? supabase.from('practice_groups').select('id, organization_id').in('id', groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assignRes.error) throw assignRes.error;
  if (groupRes.error) throw groupRes.error;

  const orgIdByGroupId = new Map<string, string>();
  (groupRes.data ?? []).forEach((g: { id: string; organization_id: string | null }) => {
    if (g.organization_id) orgIdByGroupId.set(g.id, g.organization_id);
  });

  const resolver = buildRequiredCountResolver(
    (assignRes.data ?? []) as RequiredMoveAssignment[],
    orgIdByGroupId,
  );
  return (row: RawScoreRow) =>
    resolver({ role_id: row.role_id, location_id: row.location_id, group_id: row.group_id });
}

export function useStaffWeeklyScores(options: UseStaffWeeklyScoresOptions = {}) {
  const [rawData, setRawData] = useState<RawScoreRow[]>([]);
  const [summaries, setSummaries] = useState<StaffWeekSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { weekOf } = options;
  const { overrides } = useSim();
  const masqueradeStaffId = overrides.enabled ? overrides.masqueradeStaffId : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // If masquerading, resolve the masquerade target's user_id so the RPC
      // returns the team that user would see, not the real caller's team.
      let effectiveUserId = user.id;
      if (masqueradeStaffId) {
        const { data: target } = await supabase
          .from('staff')
          .select('user_id')
          .eq('id', masqueradeStaffId)
          .maybeSingle();
        if (target?.user_id) effectiveUserId = target.user_id;
      }

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_staff_weekly_scores', {
          p_coach_user_id: effectiveUserId,
          p_week_of: weekOf || null
        })
        .limit(10000);

      if (rpcError) {
        console.error('[useStaffWeeklyScores] RPC error:', rpcError);
        throw rpcError;
      }

      if (!rpcData || rpcData.length === 0) {
        console.warn('⚠️ get_staff_weekly_scores returned no rows');
        setRawData([]);
        setSummaries([]);
        return;
      }

      const rows = rpcData as RawScoreRow[];

      // DASH-5: real per-person workload from weekly_assignments. Only
      // possible when the caller names a week; the weekOf-less path
      // (TeamPage) never reads location-level stats, so required_count
      // safely stays 0 there.
      const resolveRequiredCount = weekOf
        ? await fetchRequiredCountResolver(weekOf, rows)
        : undefined;

      setRawData(rows);
      setSummaries(aggregateStaffWeekSummary(rows, weekOf || 'current', resolveRequiredCount));
    } catch (err) {
      console.error('[useStaffWeeklyScores] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [weekOf, masqueradeStaffId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rawData, summaries, loading, error, reload: load };
}

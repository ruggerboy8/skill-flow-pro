import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawScoreRow, StaffWeekSummary } from '@/types/coachV2';
import { aggregateStaffWeekSummary } from '@/lib/coachUtils';
import { useSim } from '@/devtools/SimProvider';

interface UseStaffWeeklyScoresOptions {
  weekOf?: string | null;
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
      setRawData(rows);
      setSummaries(aggregateStaffWeekSummary(rows, weekOf || 'current'));
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

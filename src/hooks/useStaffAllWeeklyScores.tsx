import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StaffWeekSummary } from '@/types/coachV2';

// Type matching get_staff_all_weekly_scores RPC output (Nov 25 working version)
interface StaffWeeklyScore {
  staff_id: string;
  staff_name: string;
  staff_email: string;
  user_id: string;
  role_id: number;
  role_name: string;
  location_id: string;
  location_name: string;
  organization_id: string;
  organization_name: string;
  week_of: string;
  action_id: number;
  action_statement: string;
  domain_id: number | null;
  domain_name: string;
  confidence_score: number | null;
  performance_score: number | null;
  confidence_date: string | null;
  performance_date: string | null;
  confidence_late: boolean | null;
  performance_late: boolean | null;
  is_self_select: boolean;
  display_order: number;
}

interface UseStaffAllWeeklyScoresOptions {
  staffId: string | undefined;
}

export function useStaffAllWeeklyScores(options: UseStaffAllWeeklyScoresOptions) {
  const [rawData, setRawData] = useState<StaffWeeklyScore[]>([]);
  const [weekSummaries, setWeekSummaries] = useState<Map<string, StaffWeekSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { staffId } = options;

  const load = useCallback(async () => {
    if (!staffId) {
      setRawData([]);
      setWeekSummaries(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_staff_all_weekly_scores', { 
          p_staff_id: staffId
        })
        .limit(10000);

      if (rpcError) {
        console.error('[useStaffAllWeeklyScores] RPC error:', rpcError);
        throw rpcError;
      }

      if (!rpcData || !Array.isArray(rpcData) || rpcData.length === 0) {
        console.warn('⚠️ get_staff_all_weekly_scores returned no rows for staffId:', staffId);
        setRawData([]);
        setWeekSummaries(new Map());
        return;
      }

      const rows = rpcData as StaffWeeklyScore[];
      setRawData(rows);

      // Group by week
      const weekMap = new Map<string, StaffWeekSummary>();
      rows.forEach((row) => {
        const weekKey = row.week_of || 'unknown';
        
        if (!weekMap.has(weekKey)) {
          weekMap.set(weekKey, {
            staff_id: row.staff_id,
            staff_name: row.staff_name,
            staff_email: row.staff_email,
            user_id: row.user_id,
            role_id: row.role_id,
            role_name: row.role_name,
            location_id: row.location_id,
            location_name: row.location_name,
            organization_id: row.organization_id,
            organization_name: row.organization_name,
            week_of: weekKey,
            assignment_count: 0,
            conf_count: 0,
            perf_count: 0,
            has_any_late: false,
            is_complete: false,
            scores: [],
          });
        }

        const summary = weekMap.get(weekKey)!;
        summary.assignment_count++;
        summary.scores.push(row as any); // Type compatibility - RPC output differs from RawScoreRow

        if (row.confidence_score !== null) {
          summary.conf_count++;
        }
        if (row.performance_score !== null) {
          summary.perf_count++;
        }

        if (row.confidence_late || row.performance_late) {
          summary.has_any_late = true;
        }
      });

      // Calculate is_complete for each week
      weekMap.forEach((summary) => {
        summary.is_complete =
          summary.assignment_count > 0 &&
          summary.conf_count === summary.assignment_count &&
          summary.perf_count === summary.assignment_count &&
          !summary.has_any_late;
      });

      setWeekSummaries(weekMap);
    } catch (err) {
      console.error('[useStaffAllWeeklyScores] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  return { rawData, weekSummaries, loading, error, reload: load };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RawScoreRow, StaffWithScores } from '@/types/coachV2';

export function useStaffWeeklyScores() {
  const [data, setData] = useState<StaffWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_staff_weekly_scores', { p_coach_user_id: user.id });

      if (rpcError) {
        console.error('[useStaffWeeklyScores] RPC error:', rpcError);
        throw rpcError;
      }

      if (!rpcData || rpcData.length === 0) {
        console.warn('⚠️ get_staff_weekly_scores returned no rows');
        setData([]);
        return;
      }

      // Group scores by staff
      const staffMap = new Map<string, StaffWithScores>();
      
      (rpcData as RawScoreRow[]).forEach((row) => {
        if (!staffMap.has(row.staff_id)) {
          staffMap.set(row.staff_id, {
            staff: {
              id: row.staff_id,
              name: row.staff_name,
              email: row.staff_email,
              role_id: row.role_id,
              role_name: row.role_name,
              location_id: row.location_id,
              location_name: row.location_name,
              organization_id: row.organization_id,
              organization_name: row.organization_name,
            },
            scores: [],
          });
        }
        
        // Only add scores that have data (some staff might have no scores yet)
        if (row.score_id) {
          staffMap.get(row.staff_id)!.scores.push(row);
        }
      });

      setData(Array.from(staffMap.values()));
    } catch (err) {
      console.error('[useStaffWeeklyScores] Error:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return { data, loading, error, reload: load };
}

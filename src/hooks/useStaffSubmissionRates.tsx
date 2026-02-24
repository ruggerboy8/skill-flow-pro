import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateSubmissionStats, type SubmissionWindow } from '@/lib/submissionRateCalc';

export interface StaffSubmissionRate {
  staffId: string;
  completionRate: number;
}

interface UseStaffSubmissionRatesResult {
  rates: Map<string, number | null>;
  loading: boolean;
}

/**
 * Fetches 6-week submission rates for a batch of staff members.
 * Returns null for staff with no countable windows (instead of misleading 100%).
 * Returns null on query errors (instead of misleading 0%).
 */
export function useStaffSubmissionRates(staffIds: string[]): UseStaffSubmissionRatesResult {
  const sortedIds = [...staffIds].sort().join(',');
  
  const { data: rates = new Map(), isLoading } = useQuery({
    queryKey: ['staff-submission-rates-batch', sortedIds],
    queryFn: async () => {
      if (staffIds.length === 0) {
        return new Map<string, number | null>();
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 42);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const newRates = new Map<string, number | null>();

      const batchSize = 20;
      const batches: string[][] = [];
      for (let i = 0; i < staffIds.length; i += batchSize) {
        batches.push(staffIds.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const promises = batch.map(async (staffId) => {
          try {
            const { data, error } = await supabase.rpc('get_staff_submission_windows', {
              p_staff_id: staffId,
              p_since: cutoffStr,
            });

            if (error || !data) {
              return { staffId, rate: null as number | null };
            }

            const stats = calculateSubmissionStats(data as SubmissionWindow[]);
            return { staffId, rate: stats.hasData ? stats.completionRate : null };
          } catch {
            return { staffId, rate: null as number | null };
          }
        });

        const results = await Promise.all(promises);
        results.forEach(({ staffId, rate }) => {
          newRates.set(staffId, rate);
        });
      }

      return newRates;
    },
    enabled: staffIds.length > 0,
    staleTime: 30 * 1000,
  });

  return { rates, loading: isLoading };
}

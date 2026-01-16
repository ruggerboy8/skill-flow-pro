import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface StaffSubmissionRate {
  staffId: string;
  completionRate: number;
}

interface UseStaffSubmissionRatesResult {
  rates: Map<string, number>;
  loading: boolean;
}

/**
 * Fetches 6-week submission rates for a batch of staff members
 */
export function useStaffSubmissionRates(staffIds: string[]): UseStaffSubmissionRatesResult {
  const [rates, setRates] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staffIds.length === 0) {
      setRates(new Map());
      return;
    }

    const fetchRates = async () => {
      setLoading(true);
      
      // Calculate 6 weeks ago cutoff
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 42);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const newRates = new Map<string, number>();

      // Fetch in parallel batches to avoid overwhelming the API
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
              return { staffId, rate: 0 };
            }

            // Group by week + metric to get unique submission windows
            const windowMap = new Map<string, { submitted: boolean }>();
            
            data.forEach((row: any) => {
              const key = `${row.week_of}-${row.slot_index}-${row.metric}`;
              if (!windowMap.has(key)) {
                windowMap.set(key, { submitted: row.status === 'submitted' });
              }
            });

            const totalExpected = windowMap.size;
            const completed = Array.from(windowMap.values()).filter(w => w.submitted).length;
            const rate = totalExpected > 0 ? (completed / totalExpected) * 100 : 100;

            return { staffId, rate };
          } catch {
            return { staffId, rate: 0 };
          }
        });

        const results = await Promise.all(promises);
        results.forEach(({ staffId, rate }) => {
          newRates.set(staffId, rate);
        });
      }

      setRates(newRates);
      setLoading(false);
    };

    fetchRates();
  }, [staffIds.join(',')]); // Re-fetch when staff list changes

  return { rates, loading };
}

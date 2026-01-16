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

            // Group by week to track conf/perf submissions per week
            // This matches the OnTimeRateWidget logic - each week has 1 conf + 1 perf expected
            const weekMetricMap = new Map<string, { 
              conf_submitted: boolean;
              perf_submitted: boolean;
              conf_exists: boolean;
              perf_exists: boolean;
            }>();
            
            data.forEach((row: any) => {
              const key = row.week_of;
              if (!weekMetricMap.has(key)) {
                weekMetricMap.set(key, { 
                  conf_submitted: false, 
                  perf_submitted: false,
                  conf_exists: false, 
                  perf_exists: false 
                });
              }
              const weekData = weekMetricMap.get(key)!;
              
              if (row.metric === 'confidence') {
                weekData.conf_exists = true;
                // Late submissions still count as submitted
                if (row.status === 'submitted') {
                  weekData.conf_submitted = true;
                }
              } else if (row.metric === 'performance') {
                weekData.perf_exists = true;
                if (row.status === 'submitted') {
                  weekData.perf_submitted = true;
                }
              }
            });

            // Calculate totals
            let totalExpected = 0;
            let completed = 0;
            
            weekMetricMap.forEach((weekData) => {
              if (weekData.conf_exists) {
                totalExpected++;
                if (weekData.conf_submitted) completed++;
              }
              if (weekData.perf_exists) {
                totalExpected++;
                if (weekData.perf_submitted) completed++;
              }
            });

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

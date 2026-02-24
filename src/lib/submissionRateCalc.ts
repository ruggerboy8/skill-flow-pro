/**
 * Shared submission rate calculation logic.
 * Single source of truth for week-grouping and rate math used by:
 * - OnTimeRateWidget
 * - useStaffSubmissionRates
 * - LocationSubmissionWidget
 */

export interface SubmissionWindow {
  week_of: string;
  metric: 'confidence' | 'performance';
  status: 'submitted' | 'pending' | 'missing';
  on_time: boolean | null;
  due_at: string;
}

export interface SubmissionStats {
  totalExpected: number;
  completed: number;
  onTime: number;
  late: number;
  missing: number;
  completionRate: number;   // 0-100
  onTimeRate: number;       // 0-100
  hasData: boolean;         // true when totalExpected > 0
}

/**
 * Calculate submission stats from raw submission windows.
 * Filters to past-due windows, groups by week_of, buckets by metric.
 * 
 * @param windows - Raw submission window rows from RPC
 * @param now - Current time (injectable for testability)
 */
export function calculateSubmissionStats(
  windows: SubmissionWindow[],
  now: Date = new Date()
): SubmissionStats {
  const pastDueWindows = windows.filter(w => new Date(w.due_at) <= now);

  // Group by week_of, bucket by metric
  const weekMap = new Map<string, {
    conf_exists: boolean;
    conf_submitted: boolean;
    conf_on_time: boolean;
    perf_exists: boolean;
    perf_submitted: boolean;
    perf_on_time: boolean;
  }>();

  for (const w of pastDueWindows) {
    const key = w.week_of;
    if (!weekMap.has(key)) {
      weekMap.set(key, {
        conf_exists: false,
        conf_submitted: false,
        conf_on_time: false,
        perf_exists: false,
        perf_submitted: false,
        perf_on_time: false,
      });
    }
    const d = weekMap.get(key)!;

    if (w.metric === 'confidence') {
      d.conf_exists = true;
      if (w.status === 'submitted') {
        d.conf_submitted = true;
        if (w.on_time === true) d.conf_on_time = true;
      }
    } else if (w.metric === 'performance') {
      d.perf_exists = true;
      if (w.status === 'submitted') {
        d.perf_submitted = true;
        if (w.on_time === true) d.perf_on_time = true;
      }
    }
  }

  let totalExpected = 0;
  let completed = 0;
  let onTime = 0;

  weekMap.forEach(d => {
    if (d.conf_exists) {
      totalExpected++;
      if (d.conf_submitted) {
        completed++;
        if (d.conf_on_time) onTime++;
      }
    }
    if (d.perf_exists) {
      totalExpected++;
      if (d.perf_submitted) {
        completed++;
        if (d.perf_on_time) onTime++;
      }
    }
  });

  const late = completed - onTime;
  const missing = totalExpected - completed;
  const hasData = totalExpected > 0;
  const completionRate = hasData ? (completed / totalExpected) * 100 : 0;
  const onTimeRate = hasData ? (onTime / totalExpected) * 100 : 0;

  return {
    totalExpected,
    completed,
    onTime,
    late,
    missing,
    completionRate,
    onTimeRate,
    hasData,
  };
}

/**
 * Calculate cutoff date string for time filters.
 */
export function calculateCutoffDate(filter: '3weeks' | '6weeks' | 'all'): string | null {
  if (filter === '3weeks') {
    const date = new Date();
    date.setDate(date.getDate() - 21);
    return date.toISOString().split('T')[0];
  } else if (filter === '6weeks') {
    const date = new Date();
    date.setDate(date.getDate() - 42);
    return date.toISOString().split('T')[0];
  }
  return null;
}

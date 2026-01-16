import { useState, useEffect } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { Clock, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface OnTimeRateWidgetProps {
  staffId: string;
}

type TimeFilter = '3weeks' | '6weeks' | 'all';

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  '3weeks': 'Last 3 Weeks',
  '6weeks': 'Last 6 Weeks',
  'all': 'All Time',
};

interface SubmissionStats {
  totalSubmissions: number;
  completedSubmissions: number;
  completionRate: number;
  onTimeSubmissions: number;
  onTimeRate: number;
  late: number;
  missing: number;
}

export default function OnTimeRateWidget({ staffId }: OnTimeRateWidgetProps) {
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [staffId, filter]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Calculate cutoff date based on filter
      let cutoffDate: string | null = null;
      if (filter === '3weeks') {
        const date = new Date();
        date.setDate(date.getDate() - 21);
        cutoffDate = date.toISOString().split('T')[0];
      } else if (filter === '6weeks') {
        const date = new Date();
        date.setDate(date.getDate() - 42);
        cutoffDate = date.toISOString().split('T')[0];
      }

      // Call RPC to get all submission windows (including missing)
      const { data, error } = await supabase.rpc('get_staff_submission_windows', {
        p_staff_id: staffId,
        p_since: cutoffDate,
      });

      console.debug('OnTimeRateWidget: submission windows', {
        staffId,
        cutoffDate,
        rowCount: data?.length || 0,
        error: error?.message,
        sampleRow: data?.[0]
      });

      if (error) throw error;

      const now = new Date();
      const windows = data ?? [];
      const pastDueWindows = windows.filter((w: any) => new Date(w.due_at) <= now);

      // Group by week_of and metric
      const weekMetricMap = new Map<string, { 
        conf_submitted: boolean, 
        perf_submitted: boolean, 
        conf_on_time: boolean, 
        perf_on_time: boolean,
        conf_exists: boolean, 
        perf_exists: boolean 
      }>();
      
      pastDueWindows.forEach((w: any) => {
        const key = w.week_of;
        if (!weekMetricMap.has(key)) {
          weekMetricMap.set(key, { 
            conf_submitted: false, 
            perf_submitted: false, 
            conf_on_time: false, 
            perf_on_time: false,
            conf_exists: false, 
            perf_exists: false 
          });
        }
        const weekData = weekMetricMap.get(key)!;
        
        if (w.metric === 'confidence') {
          weekData.conf_exists = true;
          if (w.status === 'submitted') {
            weekData.conf_submitted = true;
            if (w.on_time === true) {
              weekData.conf_on_time = true;
            }
          }
        } else if (w.metric === 'performance') {
          weekData.perf_exists = true;
          if (w.status === 'submitted') {
            weekData.perf_submitted = true;
            if (w.on_time === true) {
              weekData.perf_on_time = true;
            }
          }
        }
      });

      // Calculate week-level stats
      let confCompleted = 0, confOnTime = 0, confTotal = 0;
      let perfCompleted = 0, perfOnTime = 0, perfTotal = 0;
      
      weekMetricMap.forEach((weekData) => {
        if (weekData.conf_exists) {
          confTotal++;
          if (weekData.conf_submitted) {
            confCompleted++;
            if (weekData.conf_on_time) confOnTime++;
          }
        }
        if (weekData.perf_exists) {
          perfTotal++;
          if (weekData.perf_submitted) {
            perfCompleted++;
            if (weekData.perf_on_time) perfOnTime++;
          }
        }
      });

      const totalExpected = confTotal + perfTotal;
      const completed = confCompleted + perfCompleted;
      const onTime = confOnTime + perfOnTime;
      const late = completed - onTime;
      const missing = totalExpected - completed;

      const completionRate = totalExpected > 0 ? (completed / totalExpected) * 100 : 0;
      // On-time rate should reflect on-time submissions out of TOTAL expected, not just completed
      // This makes missing submissions count against the on-time rate
      const onTimeRate = totalExpected > 0 ? (onTime / totalExpected) * 100 : 0;

      setStats({
        totalSubmissions: totalExpected,
        completedSubmissions: completed,
        completionRate,
        onTimeSubmissions: onTime,
        onTimeRate,
        late,
        missing
      });
    } catch (error) {
      console.error('Error loading on-time stats:', error);
      setStats({ 
        totalSubmissions: 0, 
        completedSubmissions: 0, 
        completionRate: 0, 
        onTimeSubmissions: 0, 
        onTimeRate: 0, 
        late: 0, 
        missing: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600 dark:text-emerald-400';
    if (rate >= 75) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getHealthBg = (rate: number) => {
    if (rate >= 90) return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-800/50';
    if (rate >= 75) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/50';
    return 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/50';
  };

  if (loading) {
    return <Skeleton className="h-24 w-full rounded-2xl bg-white/40 dark:bg-slate-800/40" />;
  }

  const rate = stats?.completionRate || 0;

  return (
    <div className={cn(
      "rounded-2xl border p-4 backdrop-blur-sm transition-all",
      getHealthBg(rate)
    )}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-4 mb-1">
        <span className="text-xs font-medium text-muted-foreground">
          {TIME_FILTER_LABELS[filter]}
        </span>
        <ToggleGroup 
          type="single" 
          value={filter} 
          onValueChange={(v) => v && setFilter(v as TimeFilter)} 
          size="sm"
          className="bg-white/50 dark:bg-slate-800/50 p-1 rounded-lg border border-border/30"
        >
          <ToggleGroupItem value="3weeks" className="text-xs px-2 h-6 rounded-md">3w</ToggleGroupItem>
          <ToggleGroupItem value="6weeks" className="text-xs px-2 h-6 rounded-md">6w</ToggleGroupItem>
          <ToggleGroupItem value="all" className="text-xs px-2 h-6 rounded-md">All</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Main Stats */}
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full",
          rate >= 90 ? "bg-emerald-100 dark:bg-emerald-900/50" : 
          rate >= 75 ? "bg-amber-100 dark:bg-amber-900/50" : 
          "bg-rose-100 dark:bg-rose-900/50"
        )}>
          <TrendingUp className={cn("w-5 h-5", getHealthColor(rate))} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">Completion Rate</p>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-2xl font-bold", getHealthColor(rate))}>
              {stats?.completionRate.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">
              ({stats?.completedSubmissions}/{stats?.totalSubmissions})
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      {stats && stats.totalSubmissions > 0 && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/30">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>On Time: <span className="font-semibold text-foreground">{stats.onTimeRate.toFixed(0)}%</span></span>
          </div>
          {stats.late > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Late: <span className="font-semibold text-foreground">{stats.late}</span></span>
            </div>
          )}
          {stats.missing > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Missing: <span className="font-semibold text-foreground">{stats.missing}</span></span>
            </div>
          )}
        </div>
      )}

      {stats && stats.totalSubmissions === 0 && (
        <p className="text-xs text-muted-foreground mt-2">No submissions found for this period.</p>
      )}
    </div>
  );
}

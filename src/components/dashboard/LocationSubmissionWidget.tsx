// @ts-nocheck
import { useState, useEffect } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { Clock, TrendingUp, AlertCircle, CheckCircle2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LocationSubmissionWidgetProps {
  locationId: string;
}

type TimeFilter = '3weeks' | '6weeks' | 'all';

interface LocationSubmissionStats {
  staffCount: number;
  totalSubmissions: number;
  completedSubmissions: number;
  completionRate: number;
  onTimeSubmissions: number;
  onTimeRate: number;
  late: number;
  missing: number;
}

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  '3weeks': 'Previous 3 Weeks',
  '6weeks': 'Previous 6 Weeks',
  'all': 'All Time',
};

export default function LocationSubmissionWidget({ locationId }: LocationSubmissionWidgetProps) {
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [stats, setStats] = useState<LocationSubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [locationId, filter]);

  const loadStats = async () => {
    setLoading(true);
    try {
      // First, get all participant staff for this location
      // NOTE: Supabase query builder types can trigger TS2589 in some files; isolate via `any`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb: any = supabase;
      const staffResult = await sb
        .from('staff')
        .select('id')
        .eq('primary_location_id', locationId)
        .eq('is_participant', true);
      
      if (staffResult.error) throw staffResult.error;

      const staffIds: string[] = ((staffResult.data || []) as { id: string }[]).map((s) => s.id);
      
      if (staffIds.length === 0) {
        setStats({
          staffCount: 0,
          totalSubmissions: 0,
          completedSubmissions: 0,
          completionRate: 0,
          onTimeSubmissions: 0,
          onTimeRate: 0,
          late: 0,
          missing: 0,
        });
        setLoading(false);
        return;
      }

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

      // Aggregate stats across all staff
      const now = new Date();
      let totalConfTotal = 0, totalConfCompleted = 0, totalConfOnTime = 0;
      let totalPerfTotal = 0, totalPerfCompleted = 0, totalPerfOnTime = 0;

      // Batch fetch in parallel (limit concurrency to avoid overwhelming API)
      const batchSize = 20;
      for (let i = 0; i < staffIds.length; i += batchSize) {
        const batch = staffIds.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (staffId) => {
            const { data, error } = await supabase.rpc('get_staff_submission_windows', {
              p_staff_id: staffId,
              p_since: cutoffDate,
            });
            
            if (error) {
              console.error('Error fetching windows for staff', staffId, error);
              return null;
            }
            return data || [];
          })
        );

        // Process each staff's data
        results.forEach((windows) => {
          if (!windows) return;
          
          const pastDueWindows = windows.filter((w: any) => new Date(w.due_at) <= now);
          
          // Group by week_of
          const weekMetricMap = new Map<string, { 
            conf_submitted: boolean;
            perf_submitted: boolean;
            conf_on_time: boolean;
            perf_on_time: boolean;
            conf_exists: boolean;
            perf_exists: boolean;
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

          // Aggregate this staff's stats
          weekMetricMap.forEach((weekData) => {
            if (weekData.conf_exists) {
              totalConfTotal++;
              if (weekData.conf_submitted) {
                totalConfCompleted++;
                if (weekData.conf_on_time) totalConfOnTime++;
              }
            }
            if (weekData.perf_exists) {
              totalPerfTotal++;
              if (weekData.perf_submitted) {
                totalPerfCompleted++;
                if (weekData.perf_on_time) totalPerfOnTime++;
              }
            }
          });
        });
      }

      const totalExpected = totalConfTotal + totalPerfTotal;
      const completed = totalConfCompleted + totalPerfCompleted;
      const onTime = totalConfOnTime + totalPerfOnTime;
      const late = completed - onTime;
      const missing = totalExpected - completed;

      const completionRate = totalExpected > 0 ? (completed / totalExpected) * 100 : 0;
      const onTimeRate = totalExpected > 0 ? (onTime / totalExpected) * 100 : 0;

      setStats({
        staffCount: staffIds.length,
        totalSubmissions: totalExpected,
        completedSubmissions: completed,
        completionRate,
        onTimeSubmissions: onTime,
        onTimeRate,
        late,
        missing
      });
    } catch (error) {
      console.error('Error loading location submission stats:', error);
      setStats({ 
        staffCount: 0,
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
    if (rate >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (rate >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getHealthBg = (rate: number) => {
    if (rate >= 80) return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/50 dark:border-emerald-800/50';
    if (rate >= 60) return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/50';
    return 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/50';
  };

  if (loading) {
    return <Skeleton className="h-32 w-full rounded-2xl bg-white/40 dark:bg-slate-800/40" />;
  }

  const rate = stats?.completionRate || 0;

  return (
    <div className={cn(
      "rounded-2xl border p-4 backdrop-blur-sm transition-all",
      getHealthBg(rate)
    )}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {stats?.staffCount || 0} Staff • {TIME_FILTER_LABELS[filter]}
          </span>
        </div>
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
      <div className="flex items-center gap-3 mt-2">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full",
          rate >= 90 ? "bg-emerald-100 dark:bg-emerald-900/50" : 
          rate >= 75 ? "bg-amber-100 dark:bg-amber-900/50" : 
          "bg-rose-100 dark:bg-rose-900/50"
        )}>
          <TrendingUp className={cn("w-5 h-5", getHealthColor(rate))} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">Location Completion Rate</p>
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

      {/* Disclaimer */}
      <p className="text-[10px] italic text-muted-foreground mt-3">
        *Excludes current week — assignments not yet due.
      </p>
    </div>
  );
}

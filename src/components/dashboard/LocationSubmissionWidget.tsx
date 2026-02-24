import { useState, useEffect } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { Clock, TrendingUp, AlertCircle, CheckCircle2, Users, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { calculateSubmissionStats, calculateCutoffDate, type SubmissionWindow, type SubmissionStats } from '@/lib/submissionRateCalc';

interface LocationSubmissionWidgetProps {
  locationId: string;
}

type TimeFilter = '3weeks' | '6weeks' | 'all';

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  '3weeks': 'Previous 3 Weeks',
  '6weeks': 'Previous 6 Weeks',
  'all': 'All Time',
};

interface LocationStats {
  staffCount: number;
  stats: SubmissionStats;
}

export default function LocationSubmissionWidget({ locationId }: LocationSubmissionWidgetProps) {
  const [filter, setFilter] = useState<TimeFilter>('all');
  const [data, setData] = useState<LocationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [locationId, filter]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('id')
        .eq('primary_location_id', locationId)
        .eq('is_participant', true)
        .eq('is_paused', false);
      
      if (staffError) throw staffError;

      const staffIds: string[] = (staffData || []).map((s) => s.id);
      
      if (staffIds.length === 0) {
        setData({
          staffCount: 0,
          stats: { totalExpected: 0, completed: 0, onTime: 0, late: 0, missing: 0, completionRate: 0, onTimeRate: 0, hasData: false },
        });
        setLoading(false);
        return;
      }

      const cutoffDate = calculateCutoffDate(filter);
      const now = new Date();
      let totalExpected = 0, totalCompleted = 0, totalOnTime = 0;

      // Per-staff calculation using shared utility
      const batchSize = 20;
      for (let i = 0; i < staffIds.length; i += batchSize) {
        const batch = staffIds.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (staffId) => {
            const { data: windowData, error } = await supabase.rpc('get_staff_submission_windows', {
              p_staff_id: staffId,
              p_since: cutoffDate,
            });
            if (error || !windowData) return null;
            return calculateSubmissionStats(windowData as SubmissionWindow[], now);
          })
        );

        results.forEach(staffStats => {
          if (!staffStats) return;
          totalExpected += staffStats.totalExpected;
          totalCompleted += staffStats.completed;
          totalOnTime += staffStats.onTime;
        });
      }

      const late = totalCompleted - totalOnTime;
      const missing = totalExpected - totalCompleted;
      const hasData = totalExpected > 0;

      setData({
        staffCount: staffIds.length,
        stats: {
          totalExpected,
          completed: totalCompleted,
          onTime: totalOnTime,
          late,
          missing,
          completionRate: hasData ? (totalCompleted / totalExpected) * 100 : 0,
          onTimeRate: hasData ? (totalOnTime / totalExpected) * 100 : 0,
          hasData,
        },
      });
    } catch (error) {
      console.error('Error loading location submission stats:', error);
      setData({
        staffCount: 0,
        stats: { totalExpected: 0, completed: 0, onTime: 0, late: 0, missing: 0, completionRate: 0, onTimeRate: 0, hasData: false },
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

  const stats = data?.stats;

  // No-data state
  if (!stats?.hasData) {
    return (
      <div className="rounded-2xl border p-4 backdrop-blur-sm transition-all bg-muted/30 border-border/50">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {data?.staffCount || 0} Staff • {TIME_FILTER_LABELS[filter]}
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
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
            <Minus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Location Completion Rate</p>
            <p className="text-sm text-muted-foreground">No submission data yet</p>
          </div>
        </div>
      </div>
    );
  }

  const rate = stats.completionRate;

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
            {data?.staffCount || 0} Staff • {TIME_FILTER_LABELS[filter]}
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
              {stats.completionRate.toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">
              ({stats.completed}/{stats.totalExpected})
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
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

      {/* Disclaimer */}
      <p className="text-[10px] italic text-muted-foreground mt-3">
        *Excludes current week — assignments not yet due.
      </p>
    </div>
  );
}

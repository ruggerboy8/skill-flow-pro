import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { supabase } from '@/integrations/supabase/client';
import { Clock, TrendingUp, AlertCircle, CheckCircle2, Minus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { calculateSubmissionStats, calculateCutoffDate, type SubmissionWindow } from '@/lib/submissionRateCalc';

interface OnTimeRateWidgetProps {
  staffId: string;
}

type TimeFilter = '3weeks' | '6weeks' | 'all';

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  '3weeks': 'Previous 3 Weeks',
  '6weeks': 'Previous 6 Weeks',
  'all': 'All Time',
};

export default function OnTimeRateWidget({ staffId }: OnTimeRateWidgetProps) {
  const [filter, setFilter] = useState<TimeFilter>('all');
  
  const cutoffDate = calculateCutoffDate(filter);
  
  const { data: stats, isLoading } = useQuery({
    queryKey: ['staff-submission-windows', staffId, cutoffDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_staff_submission_windows', {
        p_staff_id: staffId,
        p_since: cutoffDate,
      });

      if (error) throw error;
      
      return calculateSubmissionStats((data ?? []) as SubmissionWindow[]);
    },
    enabled: !!staffId,
    staleTime: 30 * 1000,
  });

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

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-2xl bg-white/40 dark:bg-slate-800/40" />;
  }

  // No-data state: neutral gray card instead of misleading red 0%
  if (!stats?.hasData) {
    return (
      <div className="rounded-2xl border p-4 backdrop-blur-sm transition-all bg-muted/30 border-border/50">
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
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
            <Minus className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Completion Rate</p>
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

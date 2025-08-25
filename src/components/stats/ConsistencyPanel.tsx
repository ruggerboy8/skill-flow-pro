import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatInTimeZone } from 'date-fns-tz';

type WeekCell = {
  conf_status: 'on_time' | 'late' | 'missing';
  perf_status: 'on_time' | 'late' | 'missing';
  conf_ts: string | null;
  perf_ts: string | null;
  cycle: number;
  week_in_cycle: number;
};

type ConsistencyData = {
  on_time_count: number;
  late_count: number;
  streak: number;
  weeks: WeekCell[];
};

interface ConsistencyPanelProps {
  data: ConsistencyData | null;
  loading: boolean;
  tz?: string;
}

export default function ConsistencyPanel({ data, loading, tz = 'America/Chicago' }: ConsistencyPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>How consistently am I showing up?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-20" />
            ))}
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-12 w-12" />
            ))}
          </div>
          <Skeleton className="h-8 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>How consistently am I showing up?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No consistency data available yet. Complete some weeks to see your consistency!</p>
        </CardContent>
      </Card>
    );
  }

  const getWeekBackground = (week: WeekCell) => {
    if (week.conf_status === 'on_time' && week.perf_status === 'on_time') {
      return 'bg-green-200 border-green-300';
    }
    if ((week.conf_status === 'late' || week.perf_status === 'late') && 
        week.conf_status !== 'missing' && week.perf_status !== 'missing') {
      return 'bg-yellow-200 border-yellow-300';
    }
    return 'bg-gray-200 border-gray-300';
  };

  const sortWeeksOldestFirst = (weeks: WeekCell[]) => {
    return [...weeks].sort((a,b) => 
      a.cycle === b.cycle ? a.week_in_cycle - b.week_in_cycle : a.cycle - b.cycle
    );
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    try { return formatInTimeZone(new Date(iso), tz, "EEE h:mmaaa"); } catch { return '—'; }
  };

  const line = (label: 'Confidence'|'Performance', status: string, ts: string | null) => {
    if (status === 'missing') return `${label}: —`;
    if (status === 'on_time') return `${label}: ✓ ${fmt(ts)}`;
    return `${label}: ● ${fmt(ts)}`; // late
  };

  const getNarrative = () => {
    const onTimeRate = data.on_time_count;
    if (onTimeRate >= 4) {
      return "Mostly on time in the last six weeks.";
    } else if (onTimeRate === 3) {
      return "Mixed on-time pattern recently.";
    } else {
      return "Often late or missing recently.";
    }
  };

  const weeks = data ? sortWeeksOldestFirst(data.weeks) : [];

  return (
    <Card className="ring-1 ring-border/50">
      <CardHeader>
        <CardTitle>How consistently am I showing up?</CardTitle>
        <div className="text-xs text-muted-foreground">Last 6 weeks</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI Chips */}
        <div className="flex gap-2">
          <Badge variant="secondary">
            On-time: {data.on_time_count}/6
          </Badge>
          <Badge variant="secondary">
            Current streak: {data.streak}
          </Badge>
          <Badge variant="secondary">
            Late: {data.late_count}/6
          </Badge>
        </div>

        {/* Week Strip */}
        <TooltipProvider>
          <div className="flex gap-2">
            {weeks.map((week, index) => {
              const bg = getWeekBackground(week);
              const aria = `Week ${week.cycle}-${week.week_in_cycle}: confidence ${week.conf_status}, performance ${week.perf_status}`;
              return (
                <Tooltip key={`${week.cycle}-${week.week_in_cycle}-${index}`}>
                  <TooltipTrigger aria-label={aria}>
                    <div className={`w-12 h-12 rounded-md border ${bg} ring-1 ring-border/50 flex items-center justify-center text-xs font-medium`}>
                      W{week.week_in_cycle}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-1">
                      <div>Week {week.cycle}-{week.week_in_cycle}</div>
                      <div>{line('Confidence', week.conf_status, week.conf_ts)}</div>
                      <div>{line('Performance', week.perf_status, week.perf_ts)}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Narrative */}
        <div className="text-sm text-muted-foreground">
          {getNarrative()} Current streak: {data.streak} week{data.streak !== 1 ? 's' : ''}.
        </div>
      </CardContent>
    </Card>
  );
}
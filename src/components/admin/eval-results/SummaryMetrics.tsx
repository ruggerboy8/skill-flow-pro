import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Percent, TrendingUp, ArrowUpDown } from 'lucide-react';
import type { EvalFilters } from '@/types/analytics';

interface SummaryMetricsProps {
  filters: EvalFilters;
}

export function SummaryMetrics({ filters }: SummaryMetricsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['eval-summary-metrics', filters.organizationId, filters.dateRange.start, filters.dateRange.end],
    queryFn: async () => {
      if (!filters.organizationId) return null;

      // Get submitted evaluations in date range for this org
      const { data: evals } = await supabase
        .from('evaluations')
        .select('id, staff_id')
        .eq('status', 'submitted')
        .gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString());

      const evalIds = evals?.map(e => e.id) || [];
      const uniqueStaff = new Set(evals?.map(e => e.staff_id) || []);

      // Get evaluation items
      let avgObserver: number | null = null;
      let avgSelf: number | null = null;

      if (evalIds.length > 0) {
        const { data: items } = await supabase
          .from('evaluation_items')
          .select('observer_score, self_score');

        const observerScores = (items || [])
          .map(i => i.observer_score)
          .filter((s): s is number => s !== null);
        const selfScores = (items || [])
          .map(i => i.self_score)
          .filter((s): s is number => s !== null);

        avgObserver = observerScores.length > 0 
          ? observerScores.reduce((a, b) => a + b, 0) / observerScores.length 
          : null;
        avgSelf = selfScores.length > 0 
          ? selfScores.reduce((a, b) => a + b, 0) / selfScores.length 
          : null;
      }

      const gap = avgObserver !== null && avgSelf !== null ? avgObserver - avgSelf : null;

      return {
        staff_with_evals: uniqueStaff.size,
        eval_count: evalIds.length,
        avg_observer: avgObserver,
        avg_self: avgSelf,
        gap
      };
    },
    enabled: !!filters.organizationId
  });

  if (!filters.organizationId) return null;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics = [
    {
      label: 'Staff Evaluated',
      value: data?.staff_with_evals?.toString() || '0',
      icon: Users,
      description: `${data?.eval_count || 0} evaluations total`
    },
    {
      label: 'Evaluations',
      value: data?.eval_count?.toString() || '0',
      icon: Percent,
      description: 'In selected period'
    },
    {
      label: 'Avg Observer',
      value: data?.avg_observer?.toFixed(2) || '—',
      icon: TrendingUp,
      description: 'Average observer score'
    },
    {
      label: 'Obs–Self Gap',
      value: data?.gap != null ? (data.gap >= 0 ? `+${data.gap.toFixed(2)}` : data.gap.toFixed(2)) : '—',
      icon: ArrowUpDown,
      description: data?.gap != null
        ? (data.gap > 0 ? 'Observers rate higher' : data.gap < 0 ? 'Staff rate selves higher' : 'Aligned')
        : 'Observer minus self score'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <metric.icon className="h-4 w-4" />
              <span className="text-sm">{metric.label}</span>
            </div>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

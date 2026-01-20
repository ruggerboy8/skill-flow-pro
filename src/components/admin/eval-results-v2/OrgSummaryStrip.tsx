import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, TrendingUp, Users, Target } from 'lucide-react';
import { periodToDateRange, type EvalFilters } from '@/types/analytics';
import { 
  calcRate, 
  formatRate, 
  formatMean, 
  getTopBoxColor, 
  getMismatchColor,
  getGapDirection,
  getGapLabel,
  type EvalDistributionRow 
} from '@/types/evalMetricsV2';
import { DistributionBar } from './DistributionBar';

interface OrgSummaryStripProps {
  filters: EvalFilters;
}

export function OrgSummaryStrip({ filters }: OrgSummaryStripProps) {
  const { organizationId, evaluationPeriod, locationIds, roleIds } = filters;
  
  // Build query params
  const dateRange = periodToDateRange(evaluationPeriod);
  const types = evaluationPeriod.type === 'Baseline' ? ['Baseline'] : ['Quarterly'];
  const quarter = evaluationPeriod.type === 'Quarterly' ? evaluationPeriod.quarter : null;
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['eval-distribution-metrics', organizationId, evaluationPeriod, locationIds, roleIds],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const { data, error } = await supabase.rpc('get_eval_distribution_metrics', {
        p_org_id: organizationId,
        p_types: types,
        p_program_year: evaluationPeriod.year,
        p_quarter: quarter,
        p_location_ids: locationIds.length > 0 ? locationIds : null,
        p_role_ids: roleIds.length > 0 ? roleIds : null
      });
      
      if (error) throw error;
      return data as EvalDistributionRow[];
    },
    enabled: !!organizationId
  });

  // Aggregate org-level metrics
  const orgMetrics = data ? aggregateMetrics(data) : null;

  if (!organizationId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          Select an organization to view metrics
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center text-destructive">
          Error loading metrics
        </CardContent>
      </Card>
    );
  }

  if (!orgMetrics || orgMetrics.nItems === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          No evaluation data for this period
        </CardContent>
      </Card>
    );
  }

  const topBoxRate = calcRate(orgMetrics.obsTopBox, orgMetrics.nItems);
  const bottomBoxRate = calcRate(orgMetrics.obsBottomBox, orgMetrics.nItems);
  const mismatchRate = calcRate(orgMetrics.mismatchCount, orgMetrics.nItems);
  const gap = orgMetrics.obsMean && orgMetrics.selfMean 
    ? (orgMetrics.obsMean - orgMetrics.selfMean).toFixed(1) 
    : '—';
  const gapDirection = getGapDirection(orgMetrics.obsMean, orgMetrics.selfMean);

  // Distribution for tooltip
  const distribution = {
    one: orgMetrics.obs1,
    two: orgMetrics.obs2,
    three: orgMetrics.obs3,
    four: orgMetrics.obsTopBox,
    total: orgMetrics.nItems
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Performance Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Performance</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-medium mb-2">Score Distribution</p>
                  <DistributionBar distribution={distribution} />
                  <p className="text-xs mt-2">
                    Scored 4 = Excellent performance<br />
                    Scored 1-2 = Needs development
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${getTopBoxColor(topBoxRate)}`}>
              {formatRate(topBoxRate)}
            </span>
            <span className="text-sm text-muted-foreground">scored 4</span>
          </div>
          
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-muted-foreground">
              {formatRate(bottomBoxRate)} scored 1-2
            </span>
            <span className="text-muted-foreground">
              Avg: {formatMean(orgMetrics.obsMean)}
            </span>
          </div>
          
          <div className="mt-3 text-xs text-muted-foreground">
            {orgMetrics.nItems.toLocaleString()} ratings
          </div>
        </CardContent>
      </Card>

      {/* Agreement Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Agreement</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Shows how often coach and staff gave the same score. "Different views" means they disagreed.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className={`text-3xl font-bold ${getMismatchColor(mismatchRate)}`}>
              {formatRate(mismatchRate)}
            </span>
            <span className="text-sm text-muted-foreground">disagree</span>
          </div>
          
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={gapDirection === 'aligned' ? 'secondary' : 'outline'} className="text-xs">
              {getGapLabel(gapDirection)}
            </Badge>
          </div>
          
          <div className="mt-3 text-xs text-muted-foreground">
            {orgMetrics.nItems.toLocaleString()} ratings
          </div>
        </CardContent>
      </Card>

      {/* Weekly Practice Card - Placeholder */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Weekly Practice</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Weekly practice completion for the 6 weeks before this evaluation period.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-muted-foreground">—</span>
            <span className="text-sm text-muted-foreground">completed</span>
          </div>
          
          <div className="text-sm text-muted-foreground mt-2">
            Coming soon
          </div>
          
          <div className="mt-3 text-xs text-muted-foreground italic">
            *6 weeks before evaluation
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Aggregate raw rows into org-level metrics
function aggregateMetrics(rows: EvalDistributionRow[]) {
  let nItems = 0;
  let obsTopBox = 0;
  let obsBottomBox = 0;
  let selfTopBox = 0;
  let selfBottomBox = 0;
  let mismatchCount = 0;
  let obsSum = 0;
  let selfSum = 0;
  let obsCount = 0;
  let selfCount = 0;
  
  // For distribution bar we need 1,2,3,4 counts
  // We only have top-box (4) and bottom-box (1-2) from RPC
  // Infer: obs3 = nItems - obsTopBox - obsBottomBox, obs1+obs2 = obsBottomBox
  // For now, approximate 1s and 2s as split evenly
  let obs1 = 0;
  let obs2 = 0;
  let obs3 = 0;
  
  for (const row of rows) {
    nItems += row.n_items;
    obsTopBox += row.obs_top_box;
    obsBottomBox += row.obs_bottom_box;
    selfTopBox += row.self_top_box;
    selfBottomBox += row.self_bottom_box;
    mismatchCount += row.mismatch_count;
    
    if (row.obs_mean !== null) {
      obsSum += row.obs_mean * row.n_items;
      obsCount += row.n_items;
    }
    if (row.self_mean !== null) {
      selfSum += row.self_mean * row.n_items;
      selfCount += row.n_items;
    }
  }
  
  // Approximate distribution (we'll enhance RPC later if needed)
  obs1 = Math.floor(obsBottomBox / 2);
  obs2 = obsBottomBox - obs1;
  obs3 = nItems - obsTopBox - obsBottomBox;
  
  return {
    nItems,
    obsTopBox,
    obsBottomBox,
    selfTopBox,
    selfBottomBox,
    mismatchCount,
    obsMean: obsCount > 0 ? obsSum / obsCount : null,
    selfMean: selfCount > 0 ? selfSum / selfCount : null,
    obs1,
    obs2,
    obs3
  };
}

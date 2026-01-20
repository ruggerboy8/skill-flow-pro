import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, TrendingUp, Users, Target } from 'lucide-react';
import { type EvalFilters } from '@/types/analytics';
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
import { useOrgAccountability } from '@/hooks/useOrgAccountability';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import { getDomainColorRich } from '@/lib/domainColors';

interface OrgSummaryStripProps {
  filters: EvalFilters;
}

export function OrgSummaryStrip({ filters }: OrgSummaryStripProps) {
  const { organizationId, evaluationPeriod, locationIds, roleIds } = filters;
  
  // Build query params
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

  // Weekly Practice data
  const accountability = useOrgAccountability(filters);

  // Aggregate org-level metrics
  const { orgMetrics, domainAvgs } = data ? aggregateMetrics(data) : { orgMetrics: null, domainAvgs: [] };

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
      {/* Performance Card - Equal Weight Layout */}
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
          
          {/* Domain rows with stacked rates and color-scaled averages */}
          {domainAvgs.length > 0 && (
            <div className="space-y-2">
              {domainAvgs.map(d => {
                const avgColor = getScoreColor(d.avg);
                return (
                  <div key={d.name} className="flex items-center justify-between">
                    {/* Left: Domain pill + stacked rates */}
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getDomainColorRich(d.name) }}
                      >
                        {d.name}
                      </span>
                      <div className="flex flex-col text-xs">
                        <span className={getTopBoxColor(d.topBoxRate)}>
                          {formatRate(d.topBoxRate)} scored 4
                        </span>
                        <span className="text-muted-foreground">
                          {formatRate(d.bottomBoxRate)} scored 1-2
                        </span>
                      </div>
                    </div>
                    {/* Right: Color-scaled average */}
                    <span className={`text-lg font-bold ${avgColor}`}>
                      {formatMean(d.avg)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Fallback if no domain data */}
          {domainAvgs.length === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className={`text-2xl font-bold ${getTopBoxColor(topBoxRate)}`}>
                  {formatRate(topBoxRate)}
                </span>
                <div className="text-xs text-muted-foreground">scored 4</div>
              </div>
              <div>
                <span className="text-2xl font-bold text-muted-foreground">
                  {formatRate(bottomBoxRate)}
                </span>
                <div className="text-xs text-muted-foreground">scored 1-2</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calibration Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Calibration</span>
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    How often staff self-ratings match observer scores. Lower is better.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="mb-2">
            <span className={`text-2xl font-bold ${getMismatchColor(mismatchRate)}`}>
              {formatRate(mismatchRate)}
            </span>
            <span className="text-sm text-muted-foreground ml-2">of Self Ratings differ from Observer</span>
          </div>
          
          {gapDirection !== 'aligned' && (
            <div className="flex items-center gap-2 mt-2">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs cursor-help">
                      <Info className="h-3 w-3 mr-1" />
                      {getGapLabel(gapDirection)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      {gapDirection === 'overrate' 
                        ? 'On average, staff rate themselves higher than observers do.'
                        : 'On average, staff rate themselves lower than observers do.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ProMove Submission Card - Only for Quarterly */}
      {evaluationPeriod.type !== 'Baseline' && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">ProMove Submission</span>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">
                      Weekly ProMove submission rates from the quarter before this evaluation.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {accountability.isLoading ? (
              <>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : accountability.completionRate !== null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{accountability.completionRate}%</span>
                  <span className="text-sm text-muted-foreground">completed</span>
                </div>
                
                <div className="text-sm text-muted-foreground mt-1">
                  {accountability.onTimeRate}% on time
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-muted-foreground">—</div>
                <div className="text-sm text-muted-foreground">No data available</div>
              </>
            )}
            
            {accountability.previousQuarterLabel && (
              <div className="mt-3 text-xs text-muted-foreground italic">
                *Data from {accountability.previousQuarterLabel}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Color for score averages based on thresholds
function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 3.0) return 'text-green-600';
  if (score >= 2.5) return 'text-amber-600';
  return 'text-red-600';
}

// Aggregate raw rows into org-level metrics + domain averages
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
  
  // For distribution bar
  let obs1 = 0;
  let obs2 = 0;
  let obs3 = 0;
  
  // Track domain metrics
  const domainMap = new Map<string, { 
    sum: number; 
    count: number; 
    topBox: number; 
    bottomBox: number; 
    nItems: number;
  }>();
  
  for (const row of rows) {
    nItems += row.n_items;
    obsTopBox += row.obs_top_box;
    obsBottomBox += row.obs_bottom_box;
    selfTopBox += row.self_top_box;
    selfBottomBox += row.self_bottom_box;
    mismatchCount += row.mismatch_count;
    
    // Track by domain
    if (!domainMap.has(row.domain_name)) {
      domainMap.set(row.domain_name, { sum: 0, count: 0, topBox: 0, bottomBox: 0, nItems: 0 });
    }
    const domain = domainMap.get(row.domain_name)!;
    domain.nItems += row.n_items;
    domain.topBox += row.obs_top_box;
    domain.bottomBox += row.obs_bottom_box;
    
    if (row.obs_mean !== null) {
      obsSum += row.obs_mean * row.n_items;
      obsCount += row.n_items;
      domain.sum += row.obs_mean * row.n_items;
      domain.count += row.n_items;
    }
    if (row.self_mean !== null) {
      selfSum += row.self_mean * row.n_items;
      selfCount += row.n_items;
    }
  }
  
  // Approximate distribution
  obs1 = Math.floor(obsBottomBox / 2);
  obs2 = obsBottomBox - obs1;
  obs3 = nItems - obsTopBox - obsBottomBox;
  
  // Build domain averages array - sorted by canonical order
  const domainAvgs: { name: string; avg: number; topBoxRate: number; bottomBoxRate: number }[] = [];
  for (const [name, d] of domainMap) {
    if (d.nItems > 0) {
      domainAvgs.push({ 
        name, 
        avg: d.count > 0 ? d.sum / d.count : 0,
        topBoxRate: calcRate(d.topBox, d.nItems),
        bottomBoxRate: calcRate(d.bottomBox, d.nItems)
      });
    }
  }
  domainAvgs.sort((a, b) => getDomainOrderIndex(a.name) - getDomainOrderIndex(b.name));
  
  return {
    orgMetrics: {
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
    },
    domainAvgs
  };
}

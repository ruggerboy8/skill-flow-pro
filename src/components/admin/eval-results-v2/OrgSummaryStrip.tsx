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
import { DomainDistributionRow } from './DomainDistributionRow';
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
  const { orgMetrics, domainAvgs, domainDistributions, staffCount } = data 
    ? aggregateMetrics(data) 
    : { orgMetrics: null, domainAvgs: [], domainDistributions: [], staffCount: 0 };

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
    <div className="space-y-3">
      {/* Performance - Domain Distribution Row (Top) */}
      <DomainDistributionRow domainData={domainDistributions} staffCount={staffCount} />

      {/* Calibration and ProMove Cards (Compact Row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Calibration Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
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
            
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold ${getMismatchColor(mismatchRate)}`}>
                {formatRate(mismatchRate)}
              </span>
              <span className="text-sm text-muted-foreground">of Self Ratings differ from Observer</span>
              {gapDirection !== 'aligned' && (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs cursor-help ml-2">
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
              )}
            </div>
          </CardContent>
        </Card>

        {/* ProMove Submission Card - Only for Quarterly */}
        {evaluationPeriod.type !== 'Baseline' && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
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
                <div className="flex items-baseline gap-4">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ) : accountability.completionRate !== null ? (
                <div className="flex items-baseline gap-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold">{accountability.completionRate}%</span>
                    <span className="text-sm text-muted-foreground">completed</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">{accountability.onTimeRate}% on time</span>
                  </div>
                  {accountability.previousQuarterLabel && (
                    <span className="text-xs text-muted-foreground italic">
                      *{accountability.previousQuarterLabel}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-muted-foreground">—</span>
                  <span className="text-sm text-muted-foreground">No data available</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
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

// Aggregate raw rows into org-level metrics + domain averages + domain distributions
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
  
  // Track domain metrics with full distribution
  const domainMap = new Map<string, { 
    sum: number; 
    count: number; 
    topBox: number; 
    bottomBox: number; 
    nItems: number;
    // Track individual score counts for distribution
    obs1: number;
    obs2: number;
    obs3: number;
    obs4: number;
  }>();
  
  // Track unique staff
  const staffSet = new Set<string>();
  
  for (const row of rows) {
    nItems += row.n_items;
    obsTopBox += row.obs_top_box;
    obsBottomBox += row.obs_bottom_box;
    selfTopBox += row.self_top_box;
    selfBottomBox += row.self_bottom_box;
    mismatchCount += row.mismatch_count;
    staffSet.add(row.staff_id);
    
    // Track by domain
    if (!domainMap.has(row.domain_name)) {
      domainMap.set(row.domain_name, { 
        sum: 0, count: 0, topBox: 0, bottomBox: 0, nItems: 0,
        obs1: 0, obs2: 0, obs3: 0, obs4: 0
      });
    }
    const domain = domainMap.get(row.domain_name)!;
    domain.nItems += row.n_items;
    domain.topBox += row.obs_top_box;
    domain.bottomBox += row.obs_bottom_box;
    
    // Calculate individual score counts for this row
    // obs_top_box = count of 4s, obs_bottom_box = count of 1s + 2s
    const rowObs4 = row.obs_top_box;
    const rowObs12 = row.obs_bottom_box;
    const rowObs1 = Math.floor(rowObs12 / 2);
    const rowObs2 = rowObs12 - rowObs1;
    const rowObs3 = row.n_items - rowObs4 - rowObs12;
    
    domain.obs1 += rowObs1;
    domain.obs2 += rowObs2;
    domain.obs3 += rowObs3;
    domain.obs4 += rowObs4;
    
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
  
  // Approximate distribution for org-level
  obs1 = Math.floor(obsBottomBox / 2);
  obs2 = obsBottomBox - obs1;
  obs3 = nItems - obsTopBox - obsBottomBox;
  
  // Build domain averages array - sorted by canonical order
  const domainAvgs: { name: string; avg: number; topBoxRate: number; bottomBoxRate: number }[] = [];
  const domainDistributions: { 
    name: string; 
    avg: number;
    distribution: { one: number; two: number; three: number; four: number; total: number } 
  }[] = [];
  
  for (const [name, d] of domainMap) {
    if (d.nItems > 0) {
      const avg = d.count > 0 ? d.sum / d.count : 0;
      domainAvgs.push({ 
        name, 
        avg,
        topBoxRate: calcRate(d.topBox, d.nItems),
        bottomBoxRate: calcRate(d.bottomBox, d.nItems)
      });
      
      domainDistributions.push({
        name,
        avg,
        distribution: {
          one: d.obs1,
          two: d.obs2,
          three: d.obs3,
          four: d.obs4,
          total: d.nItems
        }
      });
    }
  }
  
  domainAvgs.sort((a, b) => getDomainOrderIndex(a.name) - getDomainOrderIndex(b.name));
  domainDistributions.sort((a, b) => getDomainOrderIndex(a.name) - getDomainOrderIndex(b.name));
  
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
    domainAvgs,
    domainDistributions,
    staffCount: staffSet.size
  };
}

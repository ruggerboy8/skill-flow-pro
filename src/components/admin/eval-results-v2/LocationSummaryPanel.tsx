import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, Users, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  calcRate, 
  formatRate, 
  getMismatchColor,
  getGapDirection,
  getGapLabel,
  type EvalDistributionRow 
} from '@/types/evalMetricsV2';
import { useLocationAccountability } from '@/hooks/useLocationAccountability';
import type { EvalFilters } from '@/types/analytics';

interface LocationSummaryPanelProps {
  data: EvalDistributionRow[];
  locationId: string;
  evaluationPeriod: EvalFilters['evaluationPeriod'];
}

export function LocationSummaryPanel({ data, locationId, evaluationPeriod }: LocationSummaryPanelProps) {
  const metrics = aggregateMetrics(data);
  const accountability = useLocationAccountability(locationId, evaluationPeriod);
  const isBaseline = evaluationPeriod.type === 'Baseline';
  
  if (metrics.nItems === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            No evaluation data
          </CardContent>
        </Card>
      </div>
    );
  }

  const mismatchRate = calcRate(metrics.mismatchCount, metrics.nItems);
  const gapDirection = getGapDirection(metrics.obsMean, metrics.selfMean);

  return (
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

      {/* Weekly Practice Card - Only for Quarterly */}
      {!isBaseline && (
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
  );
}

function aggregateMetrics(rows: EvalDistributionRow[]) {
  let nItems = 0;
  let mismatchCount = 0;
  let obsSum = 0;
  let selfSum = 0;
  let obsCount = 0;
  let selfCount = 0;
  
  for (const row of rows) {
    nItems += row.n_items;
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
  
  return {
    nItems,
    mismatchCount,
    obsMean: obsCount > 0 ? obsSum / obsCount : null,
    selfMean: selfCount > 0 ? selfSum / selfCount : null
  };
}

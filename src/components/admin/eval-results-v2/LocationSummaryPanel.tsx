import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Target, Users } from 'lucide-react';
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

interface LocationSummaryPanelProps {
  data: EvalDistributionRow[];
}

export function LocationSummaryPanel({ data }: LocationSummaryPanelProps) {
  const metrics = aggregateMetrics(data);
  
  if (metrics.nItems === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-muted-foreground">
            No evaluation data
          </CardContent>
        </Card>
      </div>
    );
  }

  const topBoxRate = calcRate(metrics.obsTopBox, metrics.nItems);
  const bottomBoxRate = calcRate(metrics.obsBottomBox, metrics.nItems);
  const mismatchRate = calcRate(metrics.mismatchCount, metrics.nItems);
  const gap = metrics.obsMean && metrics.selfMean 
    ? (metrics.obsMean - metrics.selfMean).toFixed(1) 
    : '—';
  const gapDirection = getGapDirection(metrics.obsMean, metrics.selfMean);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Performance Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Performance</span>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getTopBoxColor(topBoxRate)}`}>
              {formatRate(topBoxRate)}
            </span>
            <span className="text-xs text-muted-foreground">scored 4</span>
          </div>
          
          <div className="text-xs text-muted-foreground mt-1">
            {formatRate(bottomBoxRate)} scored 1-2 · Avg: {formatMean(metrics.obsMean)}
          </div>
        </CardContent>
      </Card>

      {/* Calibration Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Calibration</span>
          </div>
          
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${getMismatchColor(mismatchRate)}`}>
              {formatRate(mismatchRate)}
            </span>
            <span className="text-xs text-muted-foreground">misaligned</span>
          </div>
          
          {gapDirection !== 'aligned' && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-[10px] h-5">
                {getGapLabel(gapDirection)}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Practice Card - Placeholder */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-sm font-medium">Weekly Practice</span>
          </div>
          
          <div className="text-2xl font-bold text-muted-foreground">—</div>
          <div className="text-xs text-muted-foreground mt-1">Coming soon</div>
        </CardContent>
      </Card>
    </div>
  );
}

function aggregateMetrics(rows: EvalDistributionRow[]) {
  let nItems = 0;
  let obsTopBox = 0;
  let obsBottomBox = 0;
  let mismatchCount = 0;
  let obsSum = 0;
  let selfSum = 0;
  let obsCount = 0;
  let selfCount = 0;
  
  for (const row of rows) {
    nItems += row.n_items;
    obsTopBox += row.obs_top_box;
    obsBottomBox += row.obs_bottom_box;
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
    obsTopBox,
    obsBottomBox,
    mismatchCount,
    obsMean: obsCount > 0 ? obsSum / obsCount : null,
    selfMean: selfCount > 0 ? selfSum / selfCount : null
  };
}

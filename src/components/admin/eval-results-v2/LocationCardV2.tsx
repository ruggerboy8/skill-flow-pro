import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, AlertTriangle } from 'lucide-react';
import { 
  formatRate, 
  formatMean, 
  getTopBoxColor, 
  getTopBoxBg,
  getMismatchColor,
  type LocationCardData 
} from '@/types/evalMetricsV2';
import { cn } from '@/lib/utils';

interface LocationCardV2Props {
  data: LocationCardData;
  onClick: () => void;
}

export function LocationCardV2({ data, onClick }: LocationCardV2Props) {
  const isLowN = data.nItems < 5;
  
  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-shadow",
        getTopBoxBg(data.topBoxRate)
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">
              {data.locationName}
            </CardTitle>
          </div>
          {isLowN && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Low N
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {data.staffWithEval} Evaluated ({data.rdaCount} RDA | {data.dfiCount} DFI)
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        {/* Primary Metric: Scored 4 Rate */}
        <div className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-bold", getTopBoxColor(data.topBoxRate))}>
            {formatRate(data.topBoxRate)}
          </span>
          <span className="text-sm text-muted-foreground">scored 4</span>
        </div>
        
        {/* Secondary Metrics */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <span className={cn("font-medium", getMismatchColor(data.mismatchRate))}>
              {formatRate(data.mismatchRate)}
            </span>
            <span className="text-muted-foreground ml-1">misaligned</span>
          </div>
          <div className="text-muted-foreground">
            Avg: {formatMean(data.obsMean)}
          </div>
        </div>
        
        {/* Weakest Domain Flag - always show when present */}
        {data.weakestDomain && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            <span>Weakest: {data.weakestDomain}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

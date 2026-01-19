import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDomainColor } from "@/lib/domainColors";

export interface DomainScore {
  domainName: string;
  avgObserver: number;
}

export interface LocationEvalStats {
  locationId: string;
  locationName: string;
  staffCount: number;
  staffWithEval: number;
  avgObserver: number | null;
  avgSelf: number | null;
  gap: number | null;  // observer - self (positive = over-confident)
  domainScores: DomainScore[];  // All domain averages
}

interface LocationEvalCardProps {
  stats: LocationEvalStats;
  onClick: () => void;
}

export function LocationEvalCard({ stats, onClick }: LocationEvalCardProps) {
  const getGapIndicator = (gap: number | null) => {
    if (gap === null) return null;
    if (Math.abs(gap) < 0.3) return { label: "Calibrated", variant: "secondary" as const };
    if (gap < 0) return { label: `Over-confident`, variant: "destructive" as const };
    return { label: `Under-confident`, variant: "outline" as const };
  };

  const gapIndicator = getGapIndicator(stats.gap);
  const evalPercent = stats.staffCount > 0 
    ? Math.round((stats.staffWithEval / stats.staffCount) * 100) 
    : 0;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all border"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-bold">{stats.locationName}</CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              {stats.staffWithEval} of {stats.staffCount} evaluated
            </div>
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {/* Calibration indicator */}
            {gapIndicator && (
              <Badge variant={gapIndicator.variant} className="gap-1 text-[10px]">
                {gapIndicator.variant === 'destructive' && <AlertTriangle className="h-3 w-3" />}
                {gapIndicator.label}
              </Badge>
            )}
            
            {/* Coverage indicator */}
            {evalPercent < 100 && (
              <Badge variant="secondary" className="text-[10px]">
                {100 - evalPercent}% missing
              </Badge>
            )}
            
            {/* All good state */}
            {evalPercent === 100 && !gapIndicator && (
              <Badge variant="secondary" className="bg-primary/10 text-primary gap-1 text-[10px]">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Domain score pills */}
        {stats.domainScores.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {stats.domainScores.map(ds => (
              <div
                key={ds.domainName}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: `${getDomainColor(ds.domainName)}20`,
                  color: getDomainColor(ds.domainName)
                }}
              >
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getDomainColor(ds.domainName) }}
                />
                <span>{ds.domainName}</span>
                <span className="font-bold">{ds.avgObserver.toFixed(1)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No evaluation data</p>
        )}
      </CardContent>
    </Card>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDomainColor } from "@/lib/domainColors";

export interface LocationEvalStats {
  locationId: string;
  locationName: string;
  staffCount: number;
  staffWithEval: number;
  avgObserver: number | null;
  avgSelf: number | null;
  gap: number | null;  // observer - self (positive = over-confident)
  weakestDomain: string | null;
}

interface LocationEvalCardProps {
  stats: LocationEvalStats;
  onClick: () => void;
}

export function LocationEvalCard({ stats, onClick }: LocationEvalCardProps) {
  // Visual status based on avg observer score
  const getStatusClasses = (score: number | null) => {
    if (score === null) return "border-muted bg-muted/20";
    if (score < 2.5) return "border-destructive/30 bg-destructive/5";
    if (score < 3.0) return "border-warning/30 bg-warning/5";
    return "border-primary/30 bg-primary/5";
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score < 2.5) return "text-destructive";
    if (score < 3.0) return "text-warning";
    return "text-primary";
  };

  const getGapIndicator = (gap: number | null) => {
    if (gap === null) return null;
    if (Math.abs(gap) < 0.3) return { label: "Calibrated", variant: "secondary" as const };
    if (gap < 0) return { label: `+${Math.abs(gap).toFixed(1)} Over-confident`, variant: "destructive" as const };
    return { label: `${gap.toFixed(1)} Under-confident`, variant: "outline" as const };
  };

  const gapIndicator = getGapIndicator(stats.gap);
  const evalPercent = stats.staffCount > 0 
    ? Math.round((stats.staffWithEval / stats.staffCount) * 100) 
    : 0;

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border-2",
        getStatusClasses(stats.avgObserver)
      )}
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
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground font-medium mb-0.5 uppercase tracking-wide">
              Avg Observer
            </div>
            <div className={cn("text-2xl font-black", getScoreColor(stats.avgObserver))}>
              {stats.avgObserver !== null ? stats.avgObserver.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              out of 4.0
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mt-2">
          {/* Calibration indicator */}
          {gapIndicator && (
            <Badge variant={gapIndicator.variant} className="gap-1 text-xs">
              {gapIndicator.variant === 'destructive' && <AlertTriangle className="h-3 w-3" />}
              {gapIndicator.label}
            </Badge>
          )}
          
          {/* Weakest domain */}
          {stats.weakestDomain && (
            <Badge 
              variant="outline" 
              className="gap-1 text-xs"
              style={{ 
                borderColor: getDomainColor(stats.weakestDomain),
                color: getDomainColor(stats.weakestDomain)
              }}
            >
              <TrendingDown className="h-3 w-3" />
              {stats.weakestDomain}
            </Badge>
          )}
          
          {/* Coverage indicator */}
          {evalPercent < 100 && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {100 - evalPercent}% no eval
            </Badge>
          )}
          
          {/* All good state */}
          {evalPercent === 100 && !gapIndicator && (
            <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
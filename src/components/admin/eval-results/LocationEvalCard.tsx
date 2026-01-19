import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDomainColor } from "@/lib/domainColors";

// Domain display order (consistent with role definitions)
const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];

export interface RoleDomainScore {
  domainName: string;
  dfiAvg: number | null;
  rdaAvg: number | null;
}

export interface LocationEvalStats {
  locationId: string;
  locationName: string;
  dfiCount: number;
  rdaCount: number;
  staffCount: number;
  staffWithEval: number;
  avgObserver: number | null;
  avgSelf: number | null;
  gap: number | null;  // observer - self (positive = under-confident)
  roleDomainScores: RoleDomainScore[];
  accountabilityRate: number | null;  // Placeholder for Phase 2
}

interface LocationEvalCardProps {
  stats: LocationEvalStats;
  onClick: () => void;
}

// Color thresholds for scores
function getScoreColor(score: number | null): string {
  if (score === null) return 'text-muted-foreground';
  if (score >= 3.0) return 'text-green-600 dark:text-green-400';
  if (score >= 2.5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBg(score: number | null): string {
  if (score === null) return 'bg-muted/30';
  if (score >= 3.0) return 'bg-green-50 dark:bg-green-950/30';
  if (score >= 2.5) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-red-50 dark:bg-red-950/30';
}

export function LocationEvalCard({ stats, onClick }: LocationEvalCardProps) {
  const getGapIndicator = (gap: number | null) => {
    if (gap === null) return null;
    if (Math.abs(gap) < 0.3) return { label: "Calibrated", variant: "secondary" as const };
    // gap = observer - self: positive means self rated lower (under-confident)
    if (gap > 0) return { label: `+${gap.toFixed(1)} gap`, variant: "outline" as const };
    return { label: `${gap.toFixed(1)} gap`, variant: "destructive" as const };
  };

  const gapIndicator = getGapIndicator(stats.gap);
  const totalStaff = stats.staffCount;
  const evaluated = stats.staffWithEval;

  // Sort domain scores by the defined order
  const sortedDomains = [...stats.roleDomainScores].sort((a, b) => {
    const aIdx = DOMAIN_ORDER.indexOf(a.domainName);
    const bIdx = DOMAIN_ORDER.indexOf(b.domainName);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all border"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-lg font-bold truncate">{stats.locationName}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <span className="font-medium">{stats.dfiCount} DFI</span>
              <span>·</span>
              <span className="font-medium">{stats.rdaCount} RDA</span>
            </div>
          </div>
          <Badge 
            variant={evaluated === totalStaff ? "secondary" : "outline"} 
            className={cn(
              "text-[10px] shrink-0",
              evaluated === totalStaff && "bg-primary/10 text-primary"
            )}
          >
            {evaluated === totalStaff ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {evaluated}/{totalStaff}
              </span>
            ) : (
              `${evaluated}/${totalStaff} submitted`
            )}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-3">
        {/* Role-Domain Matrix */}
        {sortedDomains.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground"></th>
                  <th className="text-center py-1.5 px-2 font-semibold w-14">DFI</th>
                  <th className="text-center py-1.5 px-2 font-semibold w-14">RDA</th>
                </tr>
              </thead>
              <tbody>
                {sortedDomains.map((ds, idx) => (
                  <tr key={ds.domainName} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <span 
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getDomainColor(ds.domainName) }}
                        />
                        <span className="truncate">{ds.domainName}</span>
                      </div>
                    </td>
                    <td className={cn("text-center py-1.5 px-2 font-mono font-semibold", getScoreColor(ds.dfiAvg), getScoreBg(ds.dfiAvg))}>
                      {ds.dfiAvg !== null ? ds.dfiAvg.toFixed(1) : '—'}
                    </td>
                    <td className={cn("text-center py-1.5 px-2 font-mono font-semibold", getScoreColor(ds.rdaAvg), getScoreBg(ds.rdaAvg))}>
                      {ds.rdaAvg !== null ? ds.rdaAvg.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No evaluation data</p>
        )}

        {/* Footer metrics */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Calibration gap */}
          {gapIndicator ? (
            <Badge variant={gapIndicator.variant} className="text-[10px]">
              {gapIndicator.label}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">No calibration data</span>
          )}
          
          {/* Accountability rate placeholder */}
          {stats.accountabilityRate !== null ? (
            <Badge variant="outline" className="text-[10px]">
              {Math.round(stats.accountabilityRate * 100)}% on-time
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

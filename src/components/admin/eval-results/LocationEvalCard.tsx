import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileEdit } from "lucide-react";
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
  submittedCount: number;
  draftCount: number;
  avgObserver: number | null;
  avgSelf: number | null;
  gap: number | null;  // observer - self (positive = under-confident)
  roleDomainScores: RoleDomainScore[];
  accountabilityRate: number | null;  // Placeholder for future
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

// Gap description with magnitude awareness
function getGapLabel(gap: number | null): { label: string; variant: "secondary" | "outline" | "destructive" } | null {
  if (gap === null) return null;
  
  const absGap = Math.abs(gap);
  
  if (absGap < 0.2) {
    return { label: "Calibrated", variant: "secondary" };
  }
  if (absGap < 0.5) {
    return { 
      label: gap > 0 ? `+${gap.toFixed(1)} slight` : `${gap.toFixed(1)} slight`, 
      variant: "outline" 
    };
  }
  if (absGap < 0.8) {
    return { 
      label: gap > 0 ? `+${gap.toFixed(1)} moderate` : `${gap.toFixed(1)} moderate`, 
      variant: "outline" 
    };
  }
  return { 
    label: gap > 0 ? `+${gap.toFixed(1)} large gap` : `${gap.toFixed(1)} large gap`, 
    variant: "destructive" 
  };
}

export function LocationEvalCard({ stats, onClick }: LocationEvalCardProps) {
  const gapLabel = getGapLabel(stats.gap);
  const totalStaff = stats.staffCount;
  const submitted = stats.submittedCount;
  const drafts = stats.draftCount;
  const allComplete = submitted === totalStaff && drafts === 0;

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
          
          {/* Status badge showing submitted and drafts */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {allComplete ? (
              <Badge 
                variant="secondary" 
                className="text-[10px] bg-primary/10 text-primary"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {submitted}/{totalStaff}
              </Badge>
            ) : (
              <>
                <Badge variant="outline" className="text-[10px]">
                  {submitted} submitted
                </Badge>
                {drafts > 0 && (
                  <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300">
                    <FileEdit className="h-3 w-3 mr-1" />
                    {drafts} drafts
                  </Badge>
                )}
              </>
            )}
          </div>
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
          {gapLabel ? (
            <Badge variant={gapLabel.variant} className="text-[10px]">
              {gapLabel.label}
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
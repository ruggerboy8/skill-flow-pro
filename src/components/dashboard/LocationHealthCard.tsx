import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertCircle, CheckCircle2, CloudOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface LocationStats {
  id: string;
  name: string;
  staffCount: number;
  submissionRate: number;      // 0-100 (conf+perf complete %)
  missingConfCount: number;    // staff missing confidence (after Tue deadline - LATE)
  missingPerfCount: number;    // staff missing performance (after Thu open - LATE)
  pendingConfCount?: number;   // staff not yet submitted but before deadline
}

export interface ExcuseStatus {
  isConfExcused: boolean;
  isPerfExcused: boolean;
  confReason: string | null;
  perfReason: string | null;
}

export interface SubmissionGates {
  confidenceOpen: boolean;
  confidenceClosed: boolean;
  performanceOpen: boolean;
  performanceClosed: boolean;
}

interface LocationHealthCardProps {
  stats: LocationStats;
  excuseStatus?: ExcuseStatus;
  submissionGates?: SubmissionGates;
}

export function LocationHealthCard({ 
  stats, 
  excuseStatus,
  submissionGates,
}: LocationHealthCardProps) {
  const navigate = useNavigate();

  const isFullyExcused = excuseStatus?.isConfExcused && excuseStatus?.isPerfExcused;
  const isPartiallyExcused = (excuseStatus?.isConfExcused || excuseStatus?.isPerfExcused) && !isFullyExcused;

  // Visual status based on submission rate (or excused status)
  const getStatusClasses = (rate: number) => {
    if (isFullyExcused) return "border-muted bg-muted/20";
    if (rate < 50) return "border-destructive/30 bg-destructive/5";
    if (rate < 80) return "border-warning/30 bg-warning/5";
    return "border-primary/30 bg-primary/5";
  };

  const getRateColor = (rate: number) => {
    if (isFullyExcused) return "text-muted-foreground";
    if (rate < 50) return "text-destructive";
    if (rate < 80) return "text-warning";
    return "text-primary";
  };

  // Determine which excuse badge to show based on submission period
  const getContextualExcuseBadge = () => {
    if (isFullyExcused) {
      const reason = excuseStatus?.confReason || excuseStatus?.perfReason;
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1 shrink-0">
          <CloudOff className="h-3 w-3" />
          {reason ? `Excused: ${reason}` : 'Excused'}
        </Badge>
      );
    }
    
    if (isPartiallyExcused) {
      // During confidence period (before deadline), show conf excuse prominently
      if (excuseStatus?.isConfExcused && submissionGates && !submissionGates.confidenceClosed) {
        return (
          <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
            Conf Excused{excuseStatus.confReason ? `: ${excuseStatus.confReason}` : ''}
          </Badge>
        );
      }
      
      // During performance period, show perf excuse prominently
      if (excuseStatus?.isPerfExcused && submissionGates?.performanceOpen) {
        return (
          <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
            Perf Excused{excuseStatus.perfReason ? `: ${excuseStatus.perfReason}` : ''}
          </Badge>
        );
      }
      
      // Fallback: show whichever is excused
      return (
        <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
          {excuseStatus?.isConfExcused ? 'Conf' : 'Perf'} Excused
        </Badge>
      );
    }
    
    return null;
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border-2 relative",
        getStatusClasses(stats.submissionRate)
      )}
      onClick={() => navigate(`/dashboard/location/${stats.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg font-bold truncate">{stats.name}</CardTitle>
              {getContextualExcuseBadge()}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              {stats.staffCount} Active Staff
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-primary font-medium mb-0.5 uppercase tracking-wide">
              This Week
            </div>
            <div className={cn("text-2xl font-black", getRateColor(stats.submissionRate))}>
              {isFullyExcused ? '—' : `${Math.round(stats.submissionRate)}%`}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              {isFullyExcused ? 'Location Excused' : 'Submitted'}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mt-2">
          {isFullyExcused ? (
            <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
              <CheckCircle2 className="h-3 w-3" />
              No submissions required
            </Badge>
          ) : (
            <>
              {stats.missingConfCount > 0 && !excuseStatus?.isConfExcused && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.missingConfCount} Late Conf
                </Badge>
              )}
              {(stats.pendingConfCount ?? 0) > 0 && !excuseStatus?.isConfExcused && (
                <Badge variant="outline" className="border-primary text-primary gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.pendingConfCount} Pending Conf
                </Badge>
              )}
              {stats.missingPerfCount > 0 && !excuseStatus?.isPerfExcused && (
                <Badge variant="outline" className="border-warning text-warning gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {stats.missingPerfCount} Missing Perf
                </Badge>
              )}
              {excuseStatus?.isConfExcused && (
                <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
                  Conf Excused
                </Badge>
              )}
              {excuseStatus?.isPerfExcused && (
                <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
                  Perf Excused
                </Badge>
              )}
              {stats.missingConfCount === 0 && (stats.pendingConfCount ?? 0) === 0 && stats.missingPerfCount === 0 && 
               !excuseStatus?.isConfExcused && !excuseStatus?.isPerfExcused && (
                <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  On Track
                </Badge>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

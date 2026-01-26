import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, AlertCircle, CheckCircle2, MoreVertical, CloudOff, Check, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

interface LocationHealthCardProps {
  stats: LocationStats;
  excuseStatus?: ExcuseStatus;
  canManageExcuses?: boolean;
  onToggleExcuse?: (metric: 'confidence' | 'performance') => void;
  onExcuseBoth?: () => void;
  onRemoveAllExcuses?: () => void;
  isUpdating?: boolean;
}

export function LocationHealthCard({ 
  stats, 
  excuseStatus,
  canManageExcuses = false,
  onToggleExcuse,
  onExcuseBoth,
  onRemoveAllExcuses,
  isUpdating = false,
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

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the dropdown
    if ((e.target as HTMLElement).closest('[data-dropdown-trigger]')) {
      return;
    }
    navigate(`/dashboard/location/${stats.id}`);
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border-2 relative",
        getStatusClasses(stats.submissionRate)
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold truncate">{stats.name}</CardTitle>
              {isFullyExcused && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1 shrink-0">
                  <CloudOff className="h-3 w-3" />
                  Excused
                </Badge>
              )}
              {isPartiallyExcused && (
                <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
                  {excuseStatus?.isConfExcused ? 'Conf' : 'Perf'} Excused
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              {stats.staffCount} Active Staff
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="text-right">
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
            {canManageExcuses && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild data-dropdown-trigger>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0"
                    disabled={isUpdating}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="sr-only">Location actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExcuse?.('confidence');
                    }}
                    disabled={isUpdating}
                  >
                    {excuseStatus?.isConfExcused ? (
                      <>
                        <X className="h-4 w-4 mr-2 text-destructive" />
                        Remove Confidence Excuse
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2 text-primary" />
                        Excuse Confidence (this week)
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExcuse?.('performance');
                    }}
                    disabled={isUpdating}
                  >
                    {excuseStatus?.isPerfExcused ? (
                      <>
                        <X className="h-4 w-4 mr-2 text-destructive" />
                        Remove Performance Excuse
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2 text-primary" />
                        Excuse Performance (this week)
                      </>
                    )}
                  </DropdownMenuItem>
                  
                  {!isFullyExcused && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onExcuseBoth?.();
                        }}
                        disabled={isUpdating}
                      >
                        <CloudOff className="h-4 w-4 mr-2 text-primary" />
                        Excuse Both (Weather/Closure)
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  {(excuseStatus?.isConfExcused || excuseStatus?.isPerfExcused) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveAllExcuses?.();
                        }}
                        disabled={isUpdating}
                        className="text-destructive focus:text-destructive"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove All Excuses
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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

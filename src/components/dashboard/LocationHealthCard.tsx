import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface LocationStats {
  id: string;
  name: string;
  staffCount: number;
  submissionRate: number; // 0-100 (conf+perf complete %)
  missingCount: number;   // staff with incomplete submissions
  avgConfidence: number;
  avgPerformance: number;
}

interface LocationHealthCardProps {
  stats: LocationStats;
}

export function LocationHealthCard({ stats }: LocationHealthCardProps) {
  const navigate = useNavigate();

  // Visual status based on submission rate
  const getStatusClasses = (rate: number) => {
    if (rate < 50) return "border-destructive/30 bg-destructive/5";
    if (rate < 80) return "border-warning/30 bg-warning/5";
    return "border-primary/30 bg-primary/5";
  };

  const getRateColor = (rate: number) => {
    if (rate < 50) return "text-destructive";
    if (rate < 80) return "text-warning";
    return "text-primary";
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-md transition-all border-2",
        getStatusClasses(stats.submissionRate)
      )}
      onClick={() => navigate(`/coach?loc=${encodeURIComponent(stats.name)}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg font-bold">{stats.name}</CardTitle>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              {stats.staffCount} Active Staff
            </div>
          </div>
          <div className={cn("text-2xl font-black", getRateColor(stats.submissionRate))}>
            {Math.round(stats.submissionRate)}%
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mt-2">
          {stats.missingCount > 0 ? (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {stats.missingCount} Missing
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-primary/10 text-primary gap-1">
              <CheckCircle2 className="h-3 w-3" />
              All In
            </Badge>
          )}
          {stats.avgConfidence > 0 && (
            <Badge variant="outline" className="bg-background">
              Conf: {stats.avgConfidence.toFixed(1)}
            </Badge>
          )}
          {stats.avgPerformance > 0 && (
            <Badge variant="outline" className="bg-background">
              Perf: {stats.avgPerformance.toFixed(1)}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

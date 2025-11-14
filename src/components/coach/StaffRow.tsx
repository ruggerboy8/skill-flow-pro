import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { format } from 'date-fns';

export interface StaffRowProps {
  member: {
    id: string;
    name: string;
    role_name: string;
    location: string | null;
  };
  status: {
    color: "grey" | "yellow" | "green" | "red";
    reason: string;
    subtext?: string;
    tooltip?: string;
    lastActivity?: { kind: 'confidence' | 'performance'; at: Date };
    label?: string;
    severity?: 'green' | 'yellow' | 'red' | 'grey' | 'gray';
    detail?: string;
    lastActivityText?: string;
    icon?: any;
  };
  debugInfo?: {
    activeMonday: string;
    phase: string;
    cycle: number;
    week: number;
    source: string;
    tz: string;
  };
  onClick: () => void;
}

export default function StaffRow({ member, status, debugInfo, onClick }: StaffRowProps) {
  const severity = status.severity || status.color;
  
  const chipClass = 
    severity === "green"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : severity === "yellow"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : severity === "red"
      ? "bg-red-100 text-red-800 border-red-300"
      : "bg-zinc-100 text-zinc-700 border-zinc-300";

  const chipText = status.label || status.reason;
  const tooltipText = status.detail || status.tooltip;
  const Icon = status.icon;
  
  // Compose an aria-label without "undefined"
  const aria = tooltipText
    ? `${member.name} — ${status.reason}`
    : `${member.name}`;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        {/* Make the row keyboard-accessible */}
        <button
          type="button"
          onClick={onClick}
          aria-label={aria}
          className="w-full text-left p-4 focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
        >
          <div className="grid grid-cols-12 gap-4 items-start">
            {/* Name and Role - col-span-4 to match header */}
            <div className="col-span-4 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{member.name}</h3>
                <Badge variant="secondary" className="shrink-0">
                  {member.role_name}
                </Badge>
              </div>
              {member.location && (
                <p className="text-xs text-muted-foreground mt-0.5">{member.location}</p>
              )}
              {debugInfo && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {debugInfo.activeMonday} | {debugInfo.phase} | C{debugInfo.cycle}W{debugInfo.week} | 
                  source:{debugInfo.source} | {debugInfo.tz}
                </p>
              )}
            </div>

            {/* Last Activity - col-span-3 to match header */}
            <div className="col-span-3">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">
                  {status.lastActivityText || 'No check-in yet'}
                </div>
              </div>
            </div>

            {/* Status - col-span-5 to match header */}
            <div className="col-span-5 text-right">
              {tooltipText ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${chipClass}`}
                        aria-label={`Status: ${chipText}`}
                        title={tooltipText}
                      >
                        {chipText}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{tooltipText}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${chipClass}`}
                  aria-label={`Status: ${chipText}`}
                >
                  {chipText}
                </div>
              )}
              {status.subtext && (
                <div className="text-xs text-muted-foreground mt-0.5">{status.subtext}</div>
              )}
            </div>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

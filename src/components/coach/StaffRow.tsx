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
    severity?: 'green' | 'yellow' | 'red' | 'grey';
    detail?: string;
    lastActivityText?: string;
  };
  isOnboarding?: boolean;
  debugInfo?: {
    activeMonday: string;
    phase: string;
    cycle: number;
    week: number;
    planCount: number;
    focusCount: number;
    tz: string;
  };
  onClick: () => void;
}

export default function StaffRow({ member, status, isOnboarding, debugInfo, onClick }: StaffRowProps) {
  // Use severity if available, fallback to color
  const severity = status.severity || status.color;
  
  const chipClass = 
    severity === "green"
      ? "bg-[hsl(var(--positive))] text-white"
      : severity === "yellow"
      ? "bg-[hsl(var(--warning))] text-white"
      : severity === "red"
      ? "bg-destructive text-destructive-foreground"
      : "bg-secondary text-secondary-foreground";

  // Use new label if available, fallback to mapped reason
  const chipText = status.label || 
    (status.reason === "No assignments" ? "No Assignments" :
    status.reason === "Missed check-in" ? "Missed Check-in" :
    status.reason === "Can check in" ? "Can Check In" :
    status.reason === "Waiting for Thursday" ? "Waiting" :
    status.reason === "Can check out" ? "Can Check Out" :
    status.reason === "Missed check-out" ? "Missed Check-out" :
    status.reason === "Complete" ? "Complete" :
    status.color === "green" ? "On Track" :
    status.color === "red" ? "Action Required" :
    status.color === "yellow" ? "Pending Action" :
    "On Track");

  // Use detail for tooltip if available, fallback to tooltip
  const tooltipText = status.detail || status.tooltip;
  
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
                {isOnboarding && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Onboarding
                  </Badge>
                )}
              </div>
              {member.location && (
                <p className="text-xs text-muted-foreground mt-0.5">{member.location}</p>
              )}
              {debugInfo && (
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {debugInfo.activeMonday} | {debugInfo.phase} | C{debugInfo.cycle}W{debugInfo.week} | 
                  plan:{debugInfo.planCount} focus:{debugInfo.focusCount} | {debugInfo.tz}
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

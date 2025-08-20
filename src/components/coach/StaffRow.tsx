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
  };
  onClick: () => void;
}

export default function StaffRow({ member, status, onClick }: StaffRowProps) {
  const chipClass =
    status.color === "green"
      ? "bg-[hsl(var(--positive))] text-white"
      : status.color === "yellow"
      ? "bg-[hsl(var(--warning))] text-white"
      : status.color === "red"
      ? "bg-destructive text-destructive-foreground"
      : "bg-secondary text-secondary-foreground";

  // Map status reason to chip text based on new canonical states
  const chipText =
    status.reason === "No assignments" ? "No Assignments" :
    status.reason === "Missed check-in" ? "Missed Check-in" :
    status.reason === "Can check in" ? "Can Check In" :
    status.reason === "Waiting for Thursday" ? "Waiting" :
    status.reason === "Can check out" ? "Can Check Out" :
    status.reason === "Missed check-out" ? "Missed Check-out" :
    status.reason === "Complete" ? "Complete" :
    status.color === "green" ? "On Track" :
    status.color === "red" ? "Action Required" :
    status.color === "yellow" ? "Pending Action" :
    "On Track";

  // Compose an aria-label without "undefined"
  const aria = status.tooltip
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
            </div>

            {/* Last Activity - col-span-3 to match header */}
            <div className="col-span-3">
              {status.lastActivity ? (
                <div className="text-right">
                  <div className="flex items-center justify-end gap-2 mb-1">
                    <Badge 
                      variant={status.lastActivity.kind === 'confidence' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {status.lastActivity.kind === 'confidence' ? 'Confidence' : 'Performance'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(status.lastActivity.at, 'M/d')} at {format(status.lastActivity.at, 'h:mm a')}
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">
                    No activity
                  </div>
                </div>
              )}
            </div>

            {/* Status - col-span-5 to match header */}
            <div className="col-span-5 text-right">
              {status.tooltip ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${chipClass}`}
                        aria-label={`Status: ${chipText}`}
                      >
                        {chipText}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{status.tooltip}</p>
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
              {status.tooltip && status.reason && (
                <div className="mt-1 text-sm">{status.reason}</div>
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

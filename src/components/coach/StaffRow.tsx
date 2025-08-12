import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

export interface StaffRowProps {
  member: {
    id: string;
    name: string;
    role_name: string;
    location: string | null;
  };
  status: {
    color: "grey" | "yellow" | "green";
    reason: string;
    subtext?: string;
    tooltip?: string;
  };
  onClick: () => void;
}

export default function StaffRow({ member, status, onClick }: StaffRowProps) {
  const chipClass =
    status.color === "green"
      ? "bg-[hsl(var(--positive))] text-white"
      : status.color === "yellow"
      ? "bg-[hsl(var(--warning))] text-white"
      : "bg-secondary text-secondary-foreground";

  // Tiny visible text inside the chip (still calm)
  const chipText =
    status.color === "green" ? "Complete" :
    status.color === "yellow" ? "Confidence" :
    "Not started";

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
          <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
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
          <div className="text-right">
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

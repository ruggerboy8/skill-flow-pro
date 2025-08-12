import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      aria-label={`${member.name} - ${status.reason}`}
    >
      <CardContent className="p-4">
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
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${chipClass}`}
              aria-label={`Status: ${status.color}`}
            >
              <span className="sr-only">{status.color}</span>
            </div>
            <div className="mt-1 text-sm">{status.reason}</div>
            {status.subtext && (
              <div className="text-xs text-muted-foreground mt-0.5">{status.subtext}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export interface StaffRowProps {
  member: {
    id: string;
    name: string;
    role_name: string;
    location: string | null;
  };
  confStatus: 'missing' | 'complete' | 'late';
  perfStatus: 'missing' | 'complete' | 'late';
  lastActivityText: string;
  onClick: () => void;
}

export default function StaffRow({ member, confStatus, perfStatus, lastActivityText, onClick }: StaffRowProps) {
  const getStatusIcon = (status: 'missing' | 'complete' | 'late') => {
    if (status === 'missing') {
      return <X className="h-5 w-5 text-muted-foreground" />;
    } else if (status === 'complete') {
      return <CheckCircle className="h-5 w-5 text-emerald-600" />;
    } else {
      return <AlertCircle className="h-5 w-5 text-amber-600" />;
    }
  };

  const getStatusTooltip = (type: 'confidence' | 'performance', status: 'missing' | 'complete' | 'late') => {
    if (status === 'missing') return `${type} not submitted`;
    if (status === 'late') return `${type} submitted late`;
    return `${type} submitted on time`;
  };

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onClick}
          aria-label={`${member.name} - View details`}
          className="w-full text-left p-4 focus:outline-none focus:ring-2 focus:ring-ring rounded-lg"
        >
          <div className="grid grid-cols-12 gap-4 items-center">
            {/* Name and Role - col-span-4 */}
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

            {/* Last Activity - col-span-4 */}
            <div className="col-span-4">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">
                  {lastActivityText}
                </div>
              </div>
            </div>

            {/* Confidence Status - col-span-2 */}
            <div className="col-span-2 flex items-center justify-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      {getStatusIcon(confStatus)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">{getStatusTooltip('confidence', confStatus)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Performance Status - col-span-2 */}
            <div className="col-span-2 flex items-center justify-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help">
                      {getStatusIcon(perfStatus)}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">{getStatusTooltip('performance', perfStatus)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import { ArrowUpRight, LucideIcon } from 'lucide-react';

export type AssessmentCardStatus = 'not_started' | 'in_progress' | 'completed' | 'locked';

export interface AssessmentTrackCardProps {
  title: string;
  subtitle?: string;
  status: AssessmentCardStatus;
  statusDate?: string | null;
  icon?: LucideIcon;
  onOpenResults?: () => void;
  primaryAction?: { label: string; onClick: () => void; variant?: 'default' | 'outline' };
  disabledHint?: string;
}

export function AssessmentTrackCard({
  title,
  subtitle,
  status,
  statusDate,
  icon: Icon,
  onOpenResults,
  primaryAction,
  disabledHint,
}: AssessmentTrackCardProps) {
  return (
    <Card className="p-4 flex flex-col gap-3 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && <Icon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <StatusBadge status={status} className="shrink-0" />
      </div>

      {statusDate && (
        <p className="text-xs text-muted-foreground -mt-1">
          {status === 'completed' ? 'Completed' : 'Updated'} {format(new Date(statusDate), 'MMM d, yyyy')}
        </p>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        {onOpenResults && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenResults}>
            Open results
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {primaryAction && (
          <Button
            size="sm"
            variant={primaryAction.variant || (status === 'completed' ? 'outline' : 'default')}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        )}
        {disabledHint && !onOpenResults && !primaryAction && (
          <span className="text-xs text-muted-foreground italic">{disabledHint}</span>
        )}
      </div>
    </Card>
  );
}

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type SubmissionStatus = 'complete' | 'missing' | 'late' | 'excused' | 'pending' | 'exempt' | 'not_open';

interface StatusBadgeProps {
  status: SubmissionStatus;
  className?: string;
}

const statusConfig: Record<SubmissionStatus, { label: string; style: React.CSSProperties; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  complete: {
    label: 'Complete',
    variant: 'secondary',
    style: {
      backgroundColor: 'hsl(var(--status-complete-bg))',
      color: 'hsl(var(--status-complete))',
      borderColor: 'hsl(var(--status-complete) / 0.3)',
    },
  },
  missing: {
    label: 'Missing',
    variant: 'secondary',
    style: {
      backgroundColor: 'hsl(var(--status-missing-bg))',
      color: 'hsl(var(--status-missing))',
      borderColor: 'hsl(var(--status-missing) / 0.3)',
    },
  },
  late: {
    label: 'Late',
    variant: 'secondary',
    style: {
      backgroundColor: 'hsl(var(--status-late-bg))',
      color: 'hsl(var(--status-late))',
      borderColor: 'hsl(var(--status-late) / 0.3)',
    },
  },
  excused: {
    label: 'Excused',
    variant: 'secondary',
    style: {
      backgroundColor: 'hsl(var(--status-excused-bg))',
      color: 'hsl(var(--status-excused))',
      borderColor: 'hsl(var(--status-excused) / 0.3)',
    },
  },
  pending: {
    label: 'Pending',
    variant: 'secondary',
    style: {
      backgroundColor: 'hsl(var(--status-pending-bg))',
      color: 'hsl(var(--status-pending))',
      borderColor: 'hsl(var(--status-pending) / 0.3)',
    },
  },
  exempt: {
    label: '—',
    variant: 'secondary',
    style: {},
  },
  not_open: {
    label: '—',
    variant: 'secondary',
    style: {},
  },
};

/**
 * Unified status badge for submission/evaluation status.
 * Uses CSS custom property tokens for consistent theming.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (status === 'exempt' || status === 'not_open') {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Badge
      variant={config.variant}
      className={cn('border', className)}
      style={config.style}
    >
      {config.label}
    </Badge>
  );
}

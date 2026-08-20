import type { LucideIcon } from 'lucide-react';
import { Check, Star, Circle, Clock, CheckCircle2, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Staff submission / evaluation status (weekly check-in style screens). */
export type SubmissionStatus = 'complete' | 'missing' | 'late' | 'excused' | 'pending' | 'exempt' | 'not_open';

/** Eval hand-off status shown to admins/coaches tracking delivery to staff (DSN-4). */
export type DeliveryStatus = 'no_eval' | 'draft' | 'not_released' | 'released' | 'viewed' | 'reviewed' | 'focus_set';

/** Assessment-track progress (baseline/coach-baseline tiles on the doctor detail page). */
export type TrackStatus = 'not_started' | 'in_progress' | 'completed' | 'locked';

export type BadgeStatus = SubmissionStatus | DeliveryStatus | TrackStatus;

interface StatusBadgeProps {
  status: BadgeStatus;
  /**
   * Override the default label for this status, e.g. a dynamic "45d ago"
   * string. The color/icon still come from the status's token config, so the
   * badge still reads as the same status everywhere it appears.
   */
  label?: string;
  className?: string;
}

interface StatusConfigEntry {
  label: string;
  style: React.CSSProperties;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon?: LucideIcon;
  iconFill?: boolean;
}

// A neutral/muted GRAY pill — used for states that mean "nothing to
// report" (no eval yet, not started, locked). Badge's outline variant
// renders no fill and text-foreground; secondary renders bg-secondary
// with near-black secondary-foreground text. Neither matches the
// original hand-rolled bg-muted/text-muted-foreground pill, so these
// states get their fill and text pinned explicitly via inline style,
// which always wins over the Badge variant's classes.
const NEUTRAL_FILLED: React.CSSProperties = {
  backgroundColor: 'hsl(var(--muted))',
  color: 'hsl(var(--muted-foreground))',
};

const statusConfig: Record<BadgeStatus, StatusConfigEntry> = {
  // --- Submission / evaluation status ---
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

  // --- Delivery status (eval hand-off workflow) ---
  no_eval: {
    label: 'No eval',
    variant: 'secondary',
    style: NEUTRAL_FILLED,
  },
  draft: {
    // Reuses the "late" token's amber hue — a warning/in-progress color,
    // not literally about lateness.
    label: 'Draft',
    variant: 'outline',
    style: {
      backgroundColor: 'hsl(var(--status-late-bg))',
      color: 'hsl(var(--status-late))',
      borderColor: 'hsl(var(--status-late) / 0.3)',
    },
  },
  not_released: {
    // Slightly more visible border than no_eval, matching the
    // original DeliveryStatusPill's border-muted-foreground/30.
    label: 'Not released',
    variant: 'secondary',
    style: { ...NEUTRAL_FILLED, borderColor: 'hsl(var(--muted-foreground) / 0.3)' },
  },
  released: {
    label: 'Released',
    variant: 'outline',
    style: {
      backgroundColor: 'hsl(var(--status-released-bg))',
      color: 'hsl(var(--status-released))',
      borderColor: 'hsl(var(--status-released) / 0.3)',
    },
  },
  viewed: {
    // Reuses the "late" token's amber hue, same as draft.
    label: 'Viewed',
    variant: 'outline',
    style: {
      backgroundColor: 'hsl(var(--status-late-bg))',
      color: 'hsl(var(--status-late))',
      borderColor: 'hsl(var(--status-late) / 0.3)',
    },
  },
  reviewed: {
    label: 'Reviewed',
    variant: 'outline',
    icon: Check,
    style: {
      backgroundColor: 'transparent',
      color: 'hsl(var(--status-complete))',
      borderColor: 'hsl(var(--status-complete) / 0.5)',
    },
  },
  focus_set: {
    label: 'Focus set',
    variant: 'outline',
    icon: Star,
    iconFill: true,
    style: {
      backgroundColor: 'hsl(var(--status-complete-bg))',
      color: 'hsl(var(--status-complete))',
      borderColor: 'hsl(var(--status-complete) / 0.3)',
    },
  },

  // --- Assessment track progress ---
  not_started: {
    // Original AssessmentTrackCard pill had no visible border at all
    // (variant="secondary" -> border-transparent); cancel the 'border'
    // class's global border-border default to match.
    label: 'Not started',
    variant: 'secondary',
    icon: Circle,
    style: { ...NEUTRAL_FILLED, borderColor: 'transparent' },
  },
  in_progress: {
    // Reuses the "late" token's amber hue as an in-progress/attention color.
    label: 'In progress',
    variant: 'secondary',
    icon: Clock,
    style: {
      backgroundColor: 'hsl(var(--status-late-bg))',
      color: 'hsl(var(--status-late))',
    },
  },
  completed: {
    label: 'Complete',
    variant: 'secondary',
    icon: CheckCircle2,
    style: {
      backgroundColor: 'hsl(var(--status-complete-bg))',
      color: 'hsl(var(--status-complete))',
    },
  },
  locked: {
    // Same as not_started: original had no visible border.
    label: 'Locked',
    variant: 'secondary',
    icon: Lock,
    style: { ...NEUTRAL_FILLED, borderColor: 'transparent' },
  },
};

/**
 * Unified status badge. Originally just staff submission/evaluation status;
 * DSN-4 extended it to also cover the eval-delivery workflow and assessment
 * track progress so those screens stop hand-rolling their own pills. All
 * colors come from the --status-* (and reused) CSS custom properties.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  if (status === 'exempt' || status === 'not_open') {
    return <span className="text-muted-foreground">—</span>;
  }

  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn('border', Icon && 'gap-1', className)}
      style={config.style}
    >
      {Icon && <Icon className={cn('h-4 w-4', config.iconFill && 'fill-current')} />}
      {label ?? config.label}
    </Badge>
  );
}

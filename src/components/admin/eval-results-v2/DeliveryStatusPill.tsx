import { Badge } from '@/components/ui/badge';
import { Check, Star } from 'lucide-react';
import type { StaffDeliveryStatus } from '@/hooks/useEvalDeliveryProgress';

const STATUS_CONFIG: Record<StaffDeliveryStatus, { label: string; className: string; icon?: 'check' | 'star' }> = {
  no_eval: { label: 'No eval', className: 'bg-muted text-muted-foreground border-border' },
  draft: { label: 'Draft', className: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700' },
  not_released: { label: 'Not released', className: 'bg-muted text-muted-foreground border-muted-foreground/30' },
  released: { label: 'Released', className: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-700' },
  viewed: { label: 'Viewed', className: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700' },
  reviewed: { label: 'Reviewed', className: 'bg-transparent text-green-700 border-green-500 dark:text-green-400 dark:border-green-500', icon: 'check' },
  focus_set: { label: 'Focus set', className: 'bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700', icon: 'star' },
};

interface DeliveryStatusPillProps {
  status: StaffDeliveryStatus;
}

export function DeliveryStatusPill({ status }: DeliveryStatusPillProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`text-xs font-medium gap-1 ${config.className}`}>
      {config.icon === 'check' && <Check className="w-3 h-3" />}
      {config.icon === 'star' && <Star className="w-3 h-3 fill-current" />}
      {config.label}
    </Badge>
  );
}

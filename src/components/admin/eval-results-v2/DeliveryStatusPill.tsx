import { StatusBadge } from '@/components/ui/StatusBadge';
import type { StaffDeliveryStatus } from '@/hooks/useEvalDeliveryProgress';

interface DeliveryStatusPillProps {
  status: StaffDeliveryStatus;
}

// DSN-4: delegates to the shared StatusBadge instead of hand-rolling colors,
// so eval delivery status looks the same wherever it's shown.
export function DeliveryStatusPill({ status }: DeliveryStatusPillProps) {
  return <StatusBadge status={status} />;
}

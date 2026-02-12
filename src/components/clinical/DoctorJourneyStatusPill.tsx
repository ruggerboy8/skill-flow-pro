import { Badge } from '@/components/ui/badge';
import { DoctorJourneyStatus } from '@/lib/doctorStatus';

interface Props {
  status: DoctorJourneyStatus;
  className?: string;
}

export function DoctorJourneyStatusPill({ status, className }: Props) {
  return (
    <Badge className={`${status.colorClass} hover:${status.colorClass} ${className || ''}`}>
      {status.label}
    </Badge>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { DoctorJourneyStatus } from '@/lib/doctorStatus';

interface Props {
  status: DoctorJourneyStatus;
  className?: string;
}

export function DoctorNextActionPanel({ status, className }: Props) {
  return (
    <Card className={`border-dashed ${className || ''}`}>
      <CardContent className="flex items-center gap-3 py-4">
        <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Next step</p>
          <p className="text-sm text-muted-foreground">{status.nextAction}</p>
        </div>
      </CardContent>
    </Card>
  );
}

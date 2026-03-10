import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Info } from 'lucide-react';
import { DoctorJourneyStatus } from '@/lib/doctorStatus';

interface Props {
  status: DoctorJourneyStatus;
  className?: string;
}

export function DoctorNextActionPanel({ status, className }: Props) {
  return (
    <div className={className}>
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4">
          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Next step</p>
            <p className="text-sm text-muted-foreground">{status.nextAction}</p>
          </div>
        </CardContent>
      </Card>
      {status.nudge && (
        <div className="flex items-start gap-2 mt-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{status.nudge}</p>
        </div>
      )}
    </div>
  );
}

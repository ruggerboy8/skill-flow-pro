import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface Props {
  coachAssessment: { id: string; status: string | null; updated_at: string | null; completed_at: string | null; coach_staff_id?: string } | null;
  onStartCoachWizard: () => void;
}

/**
 * Renders the private (coach-only) baseline body without outer Card chrome,
 * so it can be composed inside an AssessmentResultsSheet pop-out.
 * Summary metadata lives on the AssessmentTrackCard tile that opens it.
 */
export function DoctorDetailBaseline({ coachAssessment, onStartCoachWizard }: Props) {
  const { data: myStaff } = useStaffProfile();
  const isOwner = !coachAssessment || coachAssessment.coach_staff_id === myStaff?.id;
  const coachStatus = coachAssessment?.status;
  const coachStatusLabel = !coachAssessment ? 'Not Started' : coachStatus === 'completed' ? 'Complete' : 'In Progress';
  const coachLastUpdated = coachAssessment?.updated_at;

  const getButtonConfig = () => {
    if (!coachAssessment) return { label: 'Start assessment', show: true };
    if (isOwner) {
      return { label: coachStatus === 'completed' ? 'View / edit assessment' : 'Continue assessment', show: true };
    }
    return { label: 'View assessment', show: coachStatus === 'completed' };
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="space-y-4">
      <div className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div>
            <h3 className="text-base font-semibold tracking-tight">Private baseline</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {!isOwner && coachAssessment
                ? 'Started by another clinical director — read only'
                : 'Optional. Visible only to clinical directors.'
              }
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <Badge variant={coachStatus === 'completed' ? 'default' : 'secondary'}>
            {coachStatusLabel}
          </Badge>
          {coachLastUpdated && (
            <p className="text-xs text-muted-foreground mt-1">
              Updated {format(new Date(coachLastUpdated), 'MMM d, yyyy')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          The private baseline is your own read of where this doctor stands. It's never
          shown to the doctor, and stays available across coaching sessions as your
          calibration reference.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {buttonConfig.show && (
          <Button
            variant={coachStatus === 'completed' ? 'outline' : 'default'}
            onClick={onStartCoachWizard}
          >
            {buttonConfig.label}
          </Button>
        )}
        {!isOwner && !buttonConfig.show && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span className="text-xs">In progress</span>
          </div>
        )}
      </div>
    </div>
  );
}

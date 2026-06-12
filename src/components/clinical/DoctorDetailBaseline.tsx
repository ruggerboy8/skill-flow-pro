import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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
 * Renders only the private (coach-only) baseline card.
 * The doctor's baseline results are rendered directly in DoctorDetail.tsx
 * (above the coaching thread) so the CD's reference material sits at the
 * top of the page where they actually use it during prep.
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
      return { label: coachStatus === 'completed' ? 'View assessment' : 'Continue assessment', show: true };
    }
    return { label: 'View assessment', show: coachStatus === 'completed' };
  };

  const buttonConfig = getButtonConfig();

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Private baseline (your view)</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {!isOwner && coachAssessment
                ? 'Started by another clinical director — read only'
                : 'Optional. Visible only to clinical directors.'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <Badge variant={coachStatus === 'completed' ? 'default' : 'secondary'}>
              {coachStatusLabel}
            </Badge>
            {coachLastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Updated {format(new Date(coachLastUpdated), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          {buttonConfig.show && (
            <Button
              size="sm"
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
      </CardHeader>
    </Card>
  );
}

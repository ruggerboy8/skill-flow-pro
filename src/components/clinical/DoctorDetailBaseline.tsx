import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { ClinicalBaselineResults } from '@/components/clinical/ClinicalBaselineResults';
import { useStaffProfile } from '@/hooks/useStaffProfile';

interface Props {
  staffId: string;
  baseline: { id: string; status: string | null; started_at: string | null; completed_at: string | null } | null;
  coachAssessment: { id: string; status: string | null; updated_at: string | null; completed_at: string | null; coach_staff_id?: string } | null;
  onStartCoachWizard: () => void;
}

export function DoctorDetailBaseline({ staffId, baseline, coachAssessment, onStartCoachWizard }: Props) {
  const { data: myStaff } = useStaffProfile();
  const isOwner = !coachAssessment || coachAssessment.coach_staff_id === myStaff?.id;
  const coachStatus = coachAssessment?.status;
  const coachStatusLabel = !coachAssessment ? 'Not Started' : coachStatus === 'completed' ? 'Complete' : 'In Progress';
  const coachLastUpdated = coachAssessment?.updated_at;

  // Owner can start/continue/view; non-owner can only view completed
  const getButtonConfig = () => {
    if (!coachAssessment) return { label: 'Start Assessment', show: true };
    if (isOwner) {
      return { label: coachStatus === 'completed' ? 'View Assessment' : 'Continue Assessment', show: true };
    }
    // Non-owner: view only if completed
    return { label: 'View Assessment', show: coachStatus === 'completed' };
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="space-y-6">
      {/* Doctor Baseline Results */}
      <ClinicalBaselineResults
        staffId={staffId}
        assessmentId={baseline?.id}
        status={baseline?.status}
        completedAt={baseline?.completed_at}
      />

      {/* Coach Private Assessment Card */}
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">
                {isOwner ? 'Your Baseline Assessment (Private)' : 'Coach Baseline Assessment (Private)'}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {!isOwner && coachAssessment
                  ? 'Started by another clinical director — read only'
                  : 'Visible only to clinical directors'
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
    </div>
  );
}

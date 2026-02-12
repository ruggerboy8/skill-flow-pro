import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ClinicalBaselineResults } from '@/components/clinical/ClinicalBaselineResults';

interface Props {
  staffId: string;
  baseline: { id: string; status: string | null; started_at: string | null; completed_at: string | null } | null;
  coachAssessment: { id: string; status: string | null; updated_at: string | null; completed_at: string | null } | null;
  onStartCoachWizard: () => void;
}

export function DoctorDetailBaseline({ staffId, baseline, coachAssessment, onStartCoachWizard }: Props) {
  const coachStatus = coachAssessment?.status;
  const coachStatusLabel = !coachAssessment ? 'Not Started' : coachStatus === 'completed' ? 'Complete' : 'In Progress';
  const coachButtonLabel = !coachAssessment ? 'Start Assessment' : coachStatus === 'completed' ? 'View Assessment' : 'Continue Assessment';
  const coachLastUpdated = coachAssessment?.updated_at;

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
              <CardTitle className="text-base">Your Baseline Assessment (Private)</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Visible only to clinical directors
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
            <Button
              size="sm"
              variant={coachStatus === 'completed' ? 'outline' : 'default'}
              onClick={onStartCoachWizard}
            >
              {coachButtonLabel}
            </Button>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}

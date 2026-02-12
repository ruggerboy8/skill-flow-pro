// Derived doctor journey status — computed from baseline + coaching session data

export type DoctorJourneyStage =
  | 'invited'
  | 'baseline_in_progress'
  | 'baseline_submitted'
  | 'director_baseline_pending'
  | 'baseline_review_scheduled'
  | 'waiting_for_doctor_prep'
  | 'prep_complete'
  | 'meeting_pending'
  | 'doctor_confirmed'
  | 'followup_scheduled'
  | 'followup_completed';

export interface DoctorJourneyStatus {
  stage: DoctorJourneyStage;
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  colorClass: string;
  nextAction: string;
  nextActionUrl?: string;
}

interface BaselineInfo {
  status?: string | null;
  completed_at?: string | null;
}

interface CoachBaselineInfo {
  status?: string | null;
}

interface SessionInfo {
  id: string;
  session_type: string;
  sequence_number: number;
  status: string;
  scheduled_at: string;
}

export function getDoctorJourneyStatus(
  baseline: BaselineInfo | null | undefined,
  coachBaseline: CoachBaselineInfo | null | undefined,
  sessions: SessionInfo[] | null | undefined
): DoctorJourneyStatus {
  // Check sessions first (highest priority — active coaching cycle)
  if (sessions && sessions.length > 0) {
    // Sort by sequence_number desc to get latest session
    const sorted = [...sessions].sort((a, b) => b.sequence_number - a.sequence_number);
    const latest = sorted[0];

    const isFollowup = latest.session_type === 'followup';
    const prefix = isFollowup ? 'Follow-up' : 'Baseline review';

    switch (latest.status) {
      case 'scheduled':
        return {
          stage: isFollowup ? 'followup_scheduled' : 'baseline_review_scheduled',
          label: `${prefix} Scheduled`,
          variant: 'outline',
          colorClass: 'bg-blue-100 text-blue-800',
          nextAction: 'Complete prep for meeting',
          nextActionUrl: undefined,
        };
      case 'director_prep_ready':
        return {
          stage: 'waiting_for_doctor_prep',
          label: 'Waiting for Doctor Prep',
          variant: 'secondary',
          colorClass: 'bg-amber-100 text-amber-800',
          nextAction: 'Doctor needs to complete prep',
        };
      case 'doctor_prep_submitted':
        return {
          stage: 'prep_complete',
          label: 'Prep Complete',
          variant: 'default',
          colorClass: 'bg-emerald-100 text-emerald-800',
          nextAction: 'Ready for meeting',
        };
      case 'meeting_pending':
        return {
          stage: 'meeting_pending',
          label: 'Awaiting Confirmation',
          variant: 'secondary',
          colorClass: 'bg-purple-100 text-purple-800',
          nextAction: 'Doctor to confirm meeting summary',
        };
      case 'doctor_confirmed':
        // Check if all sessions are confirmed — if latest is confirmed, check if it's a follow-up
        if (isFollowup) {
          return {
            stage: 'followup_completed',
            label: `Follow-up ${latest.sequence_number - 1} Complete`,
            variant: 'default',
            colorClass: 'bg-green-100 text-green-800',
            nextAction: 'Schedule next follow-up',
          };
        }
        return {
          stage: 'doctor_confirmed',
          label: 'Baseline Review Complete',
          variant: 'default',
          colorClass: 'bg-green-100 text-green-800',
          nextAction: 'Schedule follow-up',
        };
      case 'doctor_revision_requested':
        return {
          stage: 'meeting_pending',
          label: 'Revision Requested',
          variant: 'destructive',
          colorClass: 'bg-red-100 text-red-800',
          nextAction: 'Review doctor feedback and update',
        };
    }
  }

  // Check coach baseline status
  if (baseline?.status === 'completed' && coachBaseline?.status !== 'completed') {
    return {
      stage: 'director_baseline_pending',
      label: 'Director Baseline Pending',
      variant: 'secondary',
      colorClass: 'bg-amber-100 text-amber-800',
      nextAction: 'Complete your private baseline assessment',
    };
  }

  // Check if both baselines done but no session yet
  if (baseline?.status === 'completed' && coachBaseline?.status === 'completed') {
    return {
      stage: 'baseline_submitted',
      label: 'Ready for Review',
      variant: 'outline',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Schedule baseline review',
    };
  }

  // Check doctor baseline
  if (baseline?.status === 'completed') {
    return {
      stage: 'baseline_submitted',
      label: 'Baseline Submitted',
      variant: 'default',
      colorClass: 'bg-green-100 text-green-800',
      nextAction: 'Review baseline results',
    };
  }

  if (baseline?.status === 'in_progress') {
    return {
      stage: 'baseline_in_progress',
      label: 'Baseline In Progress',
      variant: 'secondary',
      colorClass: 'bg-amber-100 text-amber-800',
      nextAction: 'Waiting for doctor to complete baseline',
    };
  }

  // Default: invited
  return {
    stage: 'invited',
    label: 'Invited',
    variant: 'secondary',
    colorClass: 'bg-muted text-muted-foreground',
    nextAction: 'Waiting for doctor to start baseline',
  };
}

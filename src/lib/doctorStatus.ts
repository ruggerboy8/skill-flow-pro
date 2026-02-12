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
          label: 'Prep Ready — Waiting on Doctor',
          variant: 'secondary',
          colorClass: 'bg-amber-100 text-amber-800',
          nextAction: 'Doctor needs to complete their prep',
        };
      case 'doctor_prep_submitted':
        return {
          stage: 'prep_complete',
          label: 'Ready for Meeting',
          variant: 'default',
          colorClass: 'bg-emerald-100 text-emerald-800',
          nextAction: 'Both sides are prepped — time to meet!',
        };
      case 'meeting_pending':
        return {
          stage: 'meeting_pending',
          label: 'Awaiting Doctor Sign-off',
          variant: 'secondary',
          colorClass: 'bg-purple-100 text-purple-800',
          nextAction: 'Doctor needs to review and confirm the meeting summary',
        };
      case 'doctor_confirmed':
        // Check if all sessions are confirmed — if latest is confirmed, check if it's a follow-up
        if (isFollowup) {
          return {
            stage: 'followup_completed',
            label: `Follow-up ${latest.sequence_number - 1} Complete`,
            variant: 'default',
            colorClass: 'bg-green-100 text-green-800',
            nextAction: 'Schedule next follow-up when ready',
          };
        }
        return {
          stage: 'doctor_confirmed',
          label: 'Baseline Review Complete',
          variant: 'default',
          colorClass: 'bg-green-100 text-green-800',
          nextAction: 'Schedule a follow-up to check on progress',
        };
      case 'doctor_revision_requested':
        return {
          stage: 'meeting_pending',
          label: 'Edit Requested by Doctor',
          variant: 'destructive',
          colorClass: 'bg-red-100 text-red-800',
          nextAction: 'Review the doctor\'s feedback and update the summary',
        };
    }
  }

  // Check coach baseline status
  if (baseline?.status === 'completed' && coachBaseline?.status !== 'completed') {
    return {
      stage: 'director_baseline_pending',
      label: 'Your Review Needed',
      variant: 'secondary',
      colorClass: 'bg-amber-100 text-amber-800',
      nextAction: 'Complete your private baseline assessment before scheduling',
    };
  }

  // Check if both baselines done but no session yet
  if (baseline?.status === 'completed' && coachBaseline?.status === 'completed') {
    return {
      stage: 'baseline_submitted',
      label: 'Ready to Schedule',
      variant: 'outline',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Schedule the baseline review meeting',
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
      nextAction: 'Doctor is working on their baseline',
    };
  }

  // Default: invited
  return {
    stage: 'invited',
    label: 'Invited',
    variant: 'secondary',
    colorClass: 'bg-muted text-muted-foreground',
    nextAction: 'Waiting for doctor to begin their baseline',
  };
}

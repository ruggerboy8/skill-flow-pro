// Derived doctor journey status — computed from baseline + coaching session data

export type DoctorJourneyStage =
  | 'invited'
  | 'baseline_released'
  | 'baseline_in_progress'
  | 'baseline_submitted'
  | 'ready_for_prep'
  | 'prep_complete'
  | 'scheduling_invite_sent'
  | 'meeting_ready'
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
  /** Non-blocking nudge shown as info banner, not a gate */
  nudge?: string;
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
  scheduled_at: string | null;
}

export function getDoctorJourneyStatus(
  baseline: BaselineInfo | null | undefined,
  coachBaseline: CoachBaselineInfo | null | undefined,
  sessions: SessionInfo[] | null | undefined,
  baselineReleasedAt?: string | null,
  perspective: 'coach' | 'doctor' = 'coach',
): DoctorJourneyStatus {
  // Check sessions first (highest priority — active coaching cycle)
  if (sessions && sessions.length > 0) {
    const sorted = [...sessions].sort((a, b) => b.sequence_number - a.sequence_number);
    const latest = sorted[0];

    const isFollowup = latest.session_type === 'followup';
    const prefix = isFollowup ? 'Follow-up' : 'Baseline review';

    switch (latest.status) {
      case 'scheduling_invite_sent':
        if (perspective === 'doctor') {
          return {
            stage: 'scheduling_invite_sent',
            label: 'Prep Available',
            variant: 'default',
            colorClass: 'bg-primary/10 text-primary',
            nextAction: 'Complete your meeting prep and schedule your session',
            nextActionUrl: `/doctor/review-prep/${latest.id}`,
          };
        }
        return {
          stage: 'scheduling_invite_sent',
          label: 'Pending Scheduling',
          variant: 'outline',
          colorClass: 'bg-blue-100 text-blue-800',
          nextAction: 'Waiting for doctor to schedule via the link you sent',
        };
      case 'scheduled':
        return {
          stage: isFollowup ? 'followup_scheduled' : 'meeting_ready',
          label: `${prefix} Scheduled`,
          variant: 'outline',
          colorClass: 'bg-blue-100 text-blue-800',
          nextAction: 'Start the meeting when ready',
        };
      case 'director_prep_ready':
        return {
          stage: 'prep_complete',
          label: 'Prep Complete — Ready to Invite',
          variant: 'default',
          colorClass: 'bg-emerald-100 text-emerald-800',
          nextAction: 'Send scheduling invite to doctor',
        };
      case 'meeting_pending':
        // R1.5: Softened — no longer a blocking gate
        return {
          stage: 'meeting_pending',
          label: 'Summary Shared',
          variant: 'secondary',
          colorClass: 'bg-purple-100 text-purple-800',
          nextAction: 'Doctor can review the summary. You can schedule the next session.',
        };
      case 'doctor_confirmed':
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
        // R1.5: Softened — treat same as meeting_pending with a note
        return {
          stage: 'meeting_pending',
          label: 'Summary Shared — Doctor Left a Note',
          variant: 'secondary',
          colorClass: 'bg-amber-100 text-amber-800',
          nextAction: 'Review the doctor\'s note. You can still schedule the next session.',
        };
    }
  }

  // R1.3: Removed the coach baseline scheduling gate
  // When doctor baseline is complete but coach baseline isn't,
  // show ready_for_prep with a soft nudge instead of blocking
  if (baseline?.status === 'completed' && coachBaseline !== null && coachBaseline !== undefined && coachBaseline?.status !== 'completed') {
    return {
      stage: 'ready_for_prep',
      label: 'Ready for Prep',
      variant: 'outline',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Build your meeting agenda before inviting to schedule',
      nudge: 'Tip: Complete your private baseline assessment before the meeting for better prep.',
    };
  }

  // Both baselines done but no session yet → ready for prep
  if (baseline?.status === 'completed' && coachBaseline?.status === 'completed') {
    return {
      stage: 'ready_for_prep',
      label: 'Ready for Prep',
      variant: 'outline',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Build your meeting agenda before inviting to schedule',
    };
  }

  // Doctor baseline submitted (no coach baseline info provided)
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

  // Baseline released but not started yet
  if (baselineReleasedAt && !baseline) {
    return {
      stage: 'baseline_released',
      label: 'Baseline Available',
      variant: 'secondary',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Doctor can now start their baseline self-assessment',
    };
  }

  // Default: invited
  return {
    stage: 'invited',
    label: 'Invited',
    variant: 'secondary',
    colorClass: 'bg-muted text-muted-foreground',
    nextAction: 'Release the baseline when ready for the doctor to begin',
  };
}

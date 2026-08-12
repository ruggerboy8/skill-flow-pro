// Derived doctor journey status — computed from baseline + coaching session data

import { SESSION_STATUS_CONFIG } from '@/lib/coachingSessionStatus';

export type DoctorJourneyStage =
  | 'invited'
  | 'baseline_released'
  | 'baseline_in_progress'
  | 'baseline_submitted'
  | 'coach_baseline_pending'
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

    const isFollowup = latest.session_type === 'follow_up';

    // For doctor perspective, sessions that haven't reached the invite stage
    // shouldn't override baseline status — the doctor hasn't been engaged yet
    const preInviteStatuses = ['scheduled', 'director_prep_ready'];
    if (perspective === 'doctor' && preInviteStatuses.includes(latest.status)) {
      // Fall through to baseline checks below
    } else {
      // Doctor-perspective override for the one stage the doctor actually engages
      if (perspective === 'doctor' && latest.status === 'scheduling_invite_sent') {
        return {
          stage: 'scheduling_invite_sent',
          label: 'Prep Available',
          variant: 'default',
          colorClass: 'bg-primary/10 text-primary',
          nextAction: 'Complete your meeting prep and schedule your session',
          nextActionUrl: `/doctor/review-prep/${latest.id}`,
        };
      }

      // Canonical labels + next actions come from SESSION_STATUS_CONFIG, but
      // nextAction there is written in the coach's voice ("Schedule next
      // session", "Review the doctor's note") — wrong when shown to the
      // doctor about themselves. Override with doctor-voiced copy per
      // status; fall back to the coach copy only if a status is missing
      // here (shouldn't happen, but fails safe rather than silently).
      const cfg = SESSION_STATUS_CONFIG[latest.status];
      if (cfg) {
        const stageByStatus: Record<string, DoctorJourneyStage> = {
          scheduled: 'ready_for_prep',
          director_prep_ready: 'prep_complete',
          scheduling_invite_sent: 'scheduling_invite_sent',
          doctor_prep_submitted: 'meeting_ready',
          meeting_pending: 'meeting_pending',
          doctor_confirmed: isFollowup ? 'followup_completed' : 'doctor_confirmed',
          doctor_revision_requested: 'meeting_pending',
        };
        const doctorNextAction: Record<string, string> = {
          scheduled: 'Your coach is setting up your next session',
          director_prep_ready: 'Your coach is finalizing the agenda',
          doctor_prep_submitted: "You're prepped and ready for the meeting",
          meeting_pending: 'Summary ready to review and confirm',
          doctor_confirmed: 'Completed',
          doctor_revision_requested: 'Your coach is reviewing your note',
        };
        // This branch serves BOTH perspectives (coach callers land here too,
        // e.g. from the roster) — only swap in doctor-voiced copy when the
        // caller actually asked for the doctor's perspective.
        return {
          stage: stageByStatus[latest.status] || 'ready_for_prep',
          label: cfg.label,
          variant: 'default',
          colorClass: cfg.className,
          nextAction: perspective === 'doctor' ? (doctorNextAction[latest.status] ?? cfg.nextAction) : cfg.nextAction,
        };
      }
    }
  }

  // R1.3: no hard gate — but when the doctor's baseline is in and the coach's
  // isn't, the honest next action is "complete your coach baseline", not
  // "build agenda".
  if (baseline?.status === 'completed' && coachBaseline !== null && coachBaseline !== undefined && coachBaseline?.status !== 'completed') {
    return {
      stage: 'coach_baseline_pending',
      label: 'Baseline Submitted',
      variant: 'outline',
      colorClass: 'bg-blue-100 text-blue-800',
      nextAction: 'Complete your coach baseline assessment',
      nudge: 'You can still build the agenda first, but the coach baseline gives you better prep.',
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
      nextAction: 'Complete your private assessment, then build the meeting agenda',
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

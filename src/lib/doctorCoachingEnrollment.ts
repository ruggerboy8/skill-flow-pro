// DR-1: pure helpers for the coaching-enrollment split on the doctor roster.
// "Enrolled" means staff.coaching_enrolled_at is set (see the DR-1 migration
// for the backfill rule). The roster view filter and confirm-dialog copy are
// kept here, separate from the query/component, so they can be unit tested
// without a live Supabase connection.

export type RosterViewMode = 'enrolled' | 'all';

export interface EnrollmentAwareDoctor {
  id: string;
  coaching_enrolled_at: string | null;
}

/** True when the doctor row has an enrollment timestamp set. */
export function isEnrolledInCoaching(doctor: EnrollmentAwareDoctor): boolean {
  return doctor.coaching_enrolled_at != null;
}

/**
 * Applies the roster's enrollment view filter.
 *
 * Mentee-only coaches (a doctor coach seeing just their assigned mentees)
 * always see their full assigned list; the enrollment filter is a
 * CD/super-admin org-wide roster concern only, so `menteesOnly` bypasses it
 * entirely regardless of `viewMode`.
 */
export function filterDoctorsForRosterView<T extends EnrollmentAwareDoctor>(
  doctors: T[],
  viewMode: RosterViewMode,
  menteesOnly: boolean,
): T[] {
  if (menteesOnly) return doctors;
  if (viewMode === 'all') return doctors;
  return doctors.filter(isEnrolledInCoaching);
}

/** Plain-language confirm copy for the enroll/un-enroll AlertDialogs. */
export function getEnrollmentConfirmCopy(doctorName: string, action: 'enroll' | 'unenroll') {
  if (action === 'enroll') {
    return {
      title: `Enroll ${doctorName} in coaching?`,
      description:
        'They will appear on the coaching roster and their coaching journey can begin. This does not release their baseline.',
      confirmLabel: 'Enroll',
    };
  }
  return {
    title: `Remove ${doctorName} from coaching?`,
    description:
      'They keep their history and stay in the app. They just will not show on the coaching roster.',
    confirmLabel: 'Remove',
  };
}

// DR-2: baseline release is now a separate, explicit action from invite. A
// doctor must be enrolled in coaching before their baseline can be released,
// and release only ever happens once (idempotent on the edge function side
// too, see admin-users' release_baseline action).

export interface ReleaseAwareDoctor extends EnrollmentAwareDoctor {
  baseline_released_at: string | null;
}

/** True only for a doctor who is enrolled in coaching and has not yet had their baseline released. */
export function canReleaseBaseline(doctor: ReleaseAwareDoctor): boolean {
  return isEnrolledInCoaching(doctor) && doctor.baseline_released_at == null;
}

/** Plain-language confirm copy for the Release baseline AlertDialog. */
export function getBaselineReleaseConfirmCopy(doctorName: string) {
  return {
    title: `Release the baseline for ${doctorName}?`,
    description:
      'Next time they log in they will see Your Baseline Is Ready and can start their self-assessment.',
    confirmLabel: 'Release baseline',
  };
}

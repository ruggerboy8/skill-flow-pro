import { describe, it, expect } from 'vitest';
import {
  isEnrolledInCoaching,
  filterDoctorsForRosterView,
  getEnrollmentConfirmCopy,
  type EnrollmentAwareDoctor,
} from './doctorCoachingEnrollment';

describe('isEnrolledInCoaching', () => {
  it('is true when coaching_enrolled_at is set', () => {
    expect(isEnrolledInCoaching({ id: '1', coaching_enrolled_at: '2026-08-20T00:00:00Z' })).toBe(true);
  });

  it('is false when coaching_enrolled_at is null', () => {
    expect(isEnrolledInCoaching({ id: '1', coaching_enrolled_at: null })).toBe(false);
  });
});

describe('filterDoctorsForRosterView', () => {
  const enrolled: EnrollmentAwareDoctor = { id: 'a', coaching_enrolled_at: '2026-08-20T00:00:00Z' };
  const notEnrolled: EnrollmentAwareDoctor = { id: 'b', coaching_enrolled_at: null };
  const doctors = [enrolled, notEnrolled];

  it('enrolled view keeps only enrolled doctors', () => {
    expect(filterDoctorsForRosterView(doctors, 'enrolled', false)).toEqual([enrolled]);
  });

  it('all view keeps every doctor', () => {
    expect(filterDoctorsForRosterView(doctors, 'all', false)).toEqual(doctors);
  });

  it('mentee-only view bypasses the enrollment filter entirely, even in enrolled mode', () => {
    expect(filterDoctorsForRosterView(doctors, 'enrolled', true)).toEqual(doctors);
  });

  it('mentee-only view bypasses the filter in all mode too (no-op, but stays consistent)', () => {
    expect(filterDoctorsForRosterView(doctors, 'all', true)).toEqual(doctors);
  });

  it('returns an empty array when nothing is enrolled', () => {
    expect(filterDoctorsForRosterView([notEnrolled], 'enrolled', false)).toEqual([]);
  });
});

describe('getEnrollmentConfirmCopy', () => {
  it('enroll copy is warm, plain, and explicit that baseline is unaffected', () => {
    const copy = getEnrollmentConfirmCopy('Dr. Alex Chen', 'enroll');
    expect(copy.title).toBe('Enroll Dr. Alex Chen in coaching?');
    expect(copy.description).toContain('coaching roster');
    expect(copy.description).toContain('does not release their baseline');
  });

  it('unenroll copy reassures history and app access are kept', () => {
    const copy = getEnrollmentConfirmCopy('Dr. Alex Chen', 'unenroll');
    expect(copy.title).toBe('Remove Dr. Alex Chen from coaching?');
    expect(copy.description).toContain('keep their history');
    expect(copy.description).toContain('stay in the app');
  });

  it('no em dashes anywhere in the confirm copy', () => {
    for (const action of ['enroll', 'unenroll'] as const) {
      const copy = getEnrollmentConfirmCopy('Dr. Test', action);
      expect(copy.title).not.toContain('—');
      expect(copy.description).not.toContain('—');
    }
  });
});

import { describe, it, expect } from 'vitest';
import { ownerTabFor } from './MobileTabBar';

describe('ownerTabFor', () => {
  it('maps the three tab roots to themselves', () => {
    expect(ownerTabFor('/')).toBe('home');
    expect(ownerTabFor('/my-role')).toBe('my-role');
    expect(ownerTabFor('/performance')).toBe('performance');
  });

  describe('Performance exceptions (checked before the broader /my-role match)', () => {
    it('resolves /my-role/evaluations and /my-role/practice-log to performance, not my-role', () => {
      expect(ownerTabFor('/my-role/evaluations')).toBe('performance');
      expect(ownerTabFor('/my-role/practice-log')).toBe('performance');
    });

    it('resolves any /evaluation/* route to performance', () => {
      expect(ownerTabFor('/evaluation/abc-123')).toBe('performance');
      expect(ownerTabFor('/evaluation/abc-123/review')).toBe('performance');
    });

    it('still resolves other /my-role/* subroutes to my-role', () => {
      expect(ownerTabFor('/my-role/domain/clinical')).toBe('my-role');
      expect(ownerTabFor('/my-role/area/42')).toBe('my-role');
    });
  });

  describe('Home group', () => {
    it('resolves the check-in/check-out rituals, team, and survey routes to home', () => {
      expect(ownerTabFor('/confidence/1')).toBe('home');
      expect(ownerTabFor('/confidence/1/step/2')).toBe('home');
      expect(ownerTabFor('/performance/1/step/2')).toBe('home');
      expect(ownerTabFor('/team')).toBe('home');
      expect(ownerTabFor('/team/some-staff-id')).toBe('home');
      expect(ownerTabFor('/survey/some-survey-id')).toBe('home');
    });
  });

  describe('menu-only destinations (no tab, not the removed "more" key)', () => {
    it('returns null, never "more", for /more', () => {
      const result = ownerTabFor('/more');
      expect(result).toBeNull();
      expect(result).not.toBe('more');
    });

    it('returns null, never "more", for /profile', () => {
      const result = ownerTabFor('/profile');
      expect(result).toBeNull();
      expect(result).not.toBe('more');
    });
  });

  it('returns null for an unrecognized route', () => {
    expect(ownerTabFor('/some-unmapped-route')).toBeNull();
  });
});

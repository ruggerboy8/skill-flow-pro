import { describe, it, expect } from 'vitest';
import { getManagementLinks } from './managementNavigation';

describe('getManagementLinks', () => {
  it('drops Home and My Role since the tabs already cover them', () => {
    const navigation = [
      { name: 'Home', href: '/' },
      { name: 'My Role', href: '/my-role' },
      { name: 'Coach', href: '/coach' },
    ];
    expect(getManagementLinks(navigation)).toEqual([{ name: 'Coach', href: '/coach' }]);
  });

  it('returns an empty array for a plain participant (Home + My Role only)', () => {
    const navigation = [
      { name: 'Home', href: '/' },
      { name: 'My Role', href: '/my-role' },
    ];
    expect(getManagementLinks(navigation)).toEqual([]);
  });

  it('returns an empty array for a role-less participant (Home only)', () => {
    const navigation = [{ name: 'Home', href: '/' }];
    expect(getManagementLinks(navigation)).toEqual([]);
  });

  it('keeps a lead\'s Coach entry alongside Home/My Role being dropped', () => {
    const navigation = [
      { name: 'Home', href: '/' },
      { name: 'My Role', href: '/my-role' },
      { name: 'Coach', href: '/coach' },
    ];
    const result = getManagementLinks(navigation);
    expect(result.map((r) => r.name)).toEqual(['Coach']);
  });

  it('keeps a doctor\'s /doctor/my-role even though it is labeled "My Role"', () => {
    const navigation = [
      { name: 'Home', href: '/' },
      { name: 'My Role', href: '/doctor/my-role' },
    ];
    // Exclusion is by route, not label: the doctor's role page is NOT the
    // Explore tab's /my-role, so it must survive.
    expect(getManagementLinks(navigation)).toEqual([
      { name: 'My Role', href: '/doctor/my-role' },
    ]);
  });

  it('keeps every management destination for an org admin', () => {
    const navigation = [
      { name: 'Command Center', href: '/dashboard' },
      { name: 'Coach', href: '/coach' },
      { name: 'Facilitate', href: '/facilitate' },
      { name: 'Builder', href: '/builder' },
      { name: 'Admin', href: '/admin' },
      { name: 'Evaluations', href: '/admin/evaluations' },
    ];
    expect(getManagementLinks(navigation)).toEqual(navigation);
  });

  it('keeps a super admin\'s full navigation, including Platform, unmodified', () => {
    const navigation = [
      { name: 'Command Center', href: '/dashboard' },
      { name: 'Coach', href: '/coach' },
      { name: 'Facilitate', href: '/facilitate' },
      { name: 'Training', href: '/training' },
      { name: 'Clinical', href: '/clinical' },
      { name: 'Builder', href: '/builder' },
      { name: 'Evaluations', href: '/admin/evaluations' },
      { name: 'Admin', href: '/admin' },
      { name: 'Platform', href: '/platform' },
    ];
    expect(getManagementLinks(navigation)).toEqual(navigation);
  });

  it('preserves order and does not mutate the input array', () => {
    const navigation = [
      { name: 'Home', href: '/' },
      { name: 'Admin', href: '/admin' },
      { name: 'My Role', href: '/my-role' },
      { name: 'Coach', href: '/coach' },
    ];
    const copy = [...navigation];
    const result = getManagementLinks(navigation);
    expect(result.map((r) => r.name)).toEqual(['Admin', 'Coach']);
    expect(navigation).toEqual(copy);
  });
});

import { describe, it, expect } from 'vitest';
import { resolveOrgMarkKind } from './OrgMark';
import { ALCAN_ORG_ID } from '@/lib/askAlcanAccess';

describe('resolveOrgMarkKind', () => {
  it('prefers the org logo when one is set, regardless of org id or name', () => {
    expect(
      resolveOrgMarkKind({ orgLogoUrl: 'https://example.com/logo.png', organizationId: ALCAN_ORG_ID, orgName: 'Alcan' })
    ).toBe('logo');
  });

  it('falls back to the Alcan mark for the Alcan org when there is no logo', () => {
    expect(
      resolveOrgMarkKind({ orgLogoUrl: null, organizationId: ALCAN_ORG_ID, orgName: 'Alcan Dental Cooperative' })
    ).toBe('alcan');
  });

  it('falls back to the org name for a non-Alcan org with no logo', () => {
    expect(
      resolveOrgMarkKind({ orgLogoUrl: null, organizationId: 'some-other-org-id', orgName: 'Avenue Dental' })
    ).toBe('name');
  });

  it('falls back to the caller-provided fallback when there is no logo, non-Alcan org, and no name', () => {
    expect(
      resolveOrgMarkKind({ orgLogoUrl: null, organizationId: 'some-other-org-id', orgName: null })
    ).toBe('fallback');
  });

  it('treats an empty-string logo url as unset', () => {
    expect(
      resolveOrgMarkKind({ orgLogoUrl: '', organizationId: ALCAN_ORG_ID, orgName: 'Alcan' })
    ).toBe('alcan');
  });
});

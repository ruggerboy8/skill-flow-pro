import { ALCAN_ORG_ID } from '@/lib/askAlcanAccess';

export type OrgMarkKind = 'logo' | 'alcan' | 'name' | 'fallback';

/**
 * The org cascade's priority order, as a pure decision: an org's own
 * uploaded logo wins, then the hardcoded Alcan mark (Alcan only, so a
 * future non-Alcan org never sees it), then the org's display name as
 * text, then whatever the caller wants shown when none of that is
 * available. DSN-8: this priority order is locked — do not reorder it.
 */
export function resolveOrgMarkKind({
  orgLogoUrl,
  organizationId,
  orgName,
}: {
  orgLogoUrl: string | null | undefined;
  organizationId: string | null | undefined;
  orgName: string | null | undefined;
}): OrgMarkKind {
  if (orgLogoUrl) return 'logo';
  if (organizationId === ALCAN_ORG_ID) return 'alcan';
  if (orgName) return 'name';
  return 'fallback';
}

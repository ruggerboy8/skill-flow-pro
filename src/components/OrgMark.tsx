import type { ReactNode } from 'react';
import alcanLogo from '@/assets/alcan-logo.png';
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

/**
 * The org identity half of the header's one marquee slot. Shared by the
 * desktop header (top-center) and the mobile shell header (paired with the
 * ProMovesLogo wordmark) so both read the same org logo_url / org id / org
 * name and never drift apart — see
 * docs/specs/dsn-8-product-branding-presence.md. Each caller supplies its
 * own `fallback` for when there is neither a logo nor a name: desktop falls
 * back to the generic ProMoves wordmark (it is the only mark in that slot),
 * the mobile header falls back to nothing (its ProMovesLogo pairing already
 * carries product identity next to this).
 */
export function OrgMark({
  orgLogoUrl,
  organizationId,
  orgName,
  fallback = null,
  imgClassName = 'h-6 object-contain dark:invert',
  textClassName = 'text-sm font-semibold text-foreground',
}: {
  orgLogoUrl: string | null | undefined;
  organizationId: string | null | undefined;
  orgName: string | null | undefined;
  fallback?: ReactNode;
  imgClassName?: string;
  textClassName?: string;
}) {
  const kind = resolveOrgMarkKind({ orgLogoUrl, organizationId, orgName });

  switch (kind) {
    case 'logo':
      return <img src={orgLogoUrl!} alt={orgName ?? 'ProMoves'} className={imgClassName} />;
    case 'alcan':
      return <img src={alcanLogo} alt="Alcan" className={imgClassName} />;
    case 'name':
      return <span className={textClassName}>{orgName}</span>;
    case 'fallback':
    default:
      return <>{fallback}</>;
  }
}

import { useRef, type ReactNode } from 'react';
import alcanLogo from '@/assets/alcan-logo.png';
import { cn } from '@/lib/utils';
import { resolveOrgMarkKind } from '@/lib/orgMark';

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
 *
 * `pending` covers the gap while org data is still loading (organizationId
 * not yet known): it renders an invisible height-only placeholder instead
 * of resolving to the fallback branch early, then eases the real mark in
 * with a soft opacity transition once it arrives, rather than a hard pop.
 * A caller that never passes `pending` (or that already knows its org data
 * on first render) never sees that animation — it is only for smoothing
 * the specific pending -> resolved transition.
 */
export function OrgMark({
  orgLogoUrl,
  organizationId,
  orgName,
  pending = false,
  fallback = null,
  imgClassName = 'h-6 object-contain dark:invert',
  textClassName = 'text-sm font-semibold text-foreground',
}: {
  orgLogoUrl: string | null | undefined;
  organizationId: string | null | undefined;
  orgName: string | null | undefined;
  pending?: boolean;
  fallback?: ReactNode;
  imgClassName?: string;
  textClassName?: string;
}) {
  // Captured once, on mount: only an instance that actually started out
  // pending should ease in when it resolves. Everything else (a static
  // import, or a caller whose org data was already known on first paint)
  // renders immediately, no animation.
  const startedPending = useRef(pending).current;

  if (pending) {
    return <div className="h-6" aria-hidden="true" />;
  }

  const kind = resolveOrgMarkKind({ orgLogoUrl, organizationId, orgName });
  // duration-200 is the same 200ms as the --duration-quick token (Tailwind's
  // arbitrary-value syntax for that CSS var is ambiguous here between
  // transition-duration and the animate plugin's animation-duration, so the
  // named scale class is used instead — same value, no build warning).
  const revealClassName = startedPending
    ? 'animate-in fade-in-0 duration-200 ease-brand motion-reduce:animate-none'
    : undefined;

  switch (kind) {
    case 'logo':
      return <img src={orgLogoUrl!} alt={orgName ?? 'ProMoves'} className={cn(imgClassName, revealClassName)} />;
    case 'alcan':
      return <img src={alcanLogo} alt="Alcan" className={cn(imgClassName, revealClassName)} />;
    case 'name':
      return <span className={cn(textClassName, revealClassName)}>{orgName}</span>;
    case 'fallback':
    default:
      return revealClassName ? <span className={revealClassName}>{fallback}</span> : <>{fallback}</>;
  }
}

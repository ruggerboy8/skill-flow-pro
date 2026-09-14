import { cn } from '@/lib/utils';

/**
 * The generic, product-level Pro Moves wordmark (the drawn Signal P lockup,
 * masters in promoves-brand/exports/). Use this anywhere there is no
 * organization context — pre-auth screens and as the fallback when an org
 * hasn't uploaded its own logo. For org-specific surfaces, prefer the org's
 * logo_url via useOrgBranding and fall back to this.
 *
 * Two builds of the mark (2026-09-02, from the take-3 clip review):
 * - master (`promoves-wordmark.svg`): hero/marketing sizes.
 * - small build (`promoves-wordmark-small.svg`, icon-build P: wider gap,
 *   dot r7): app chrome and anything rendered below ~32px cap height,
 *   where the master's dot visually dies. Pass `small` on headers,
 *   sidebars, and menus; leave pre-auth/hero screens on the master.
 *
 * Sizing: the image height is em-based, so existing text-size classes
 * (text-base, text-xl, text-3xl) passed via className keep working as scale
 * controls, exactly as they did for the old typed-text version. Light-ground
 * variant only; the app has no dark chrome behind the logo today (the
 * -reversed and -small-dark masters exist in the kit when that day comes).
 */
export function ProMovesLogo({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <img
      src={small ? '/brand/promoves-wordmark-small.svg' : '/brand/promoves-wordmark.svg'}
      alt="Pro Moves"
      className={cn(
        // max-w-full + object-contain: in narrow containers (the max-w-md
        // pre-auth cards on a phone) the mark shrinks to fit, keeping its
        // aspect ratio instead of overflowing the card.
        'inline-block h-[1.5em] w-auto max-w-full object-contain align-middle select-none',
        className
      )}
      draggable={false}
    />
  );
}

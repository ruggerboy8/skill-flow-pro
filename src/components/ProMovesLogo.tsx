import { cn } from '@/lib/utils';

/**
 * The generic, product-level Pro Moves wordmark (the drawn Signal P lockup,
 * masters in promoves-brand/exports/). Use this anywhere there is no
 * organization context — pre-auth screens and as the fallback when an org
 * hasn't uploaded its own logo. For org-specific surfaces, prefer the org's
 * logo_url via useOrgBranding and fall back to this.
 *
 * Sizing: the image height is em-based, so existing text-size classes
 * (text-base, text-xl, text-3xl) passed via className keep working as scale
 * controls, exactly as they did for the old typed-text version. Light-ground
 * variant only; the app has no dark chrome behind the logo today (the
 * -reversed master exists in the kit when that day comes).
 */
export function ProMovesLogo({ className }: { className?: string }) {
  return (
    <img
      src="/brand/promoves-wordmark.svg"
      alt="Pro Moves"
      className={cn('inline-block h-[1.5em] w-auto align-middle select-none', className)}
      draggable={false}
    />
  );
}

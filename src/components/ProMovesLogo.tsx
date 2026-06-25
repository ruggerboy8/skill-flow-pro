import { cn } from '@/lib/utils';

/**
 * The generic, product-level ProMoves wordmark (matches the landing-page logo).
 * Use this anywhere there is no organization context — pre-auth screens and as
 * the fallback when an org hasn't uploaded its own logo. For org-specific
 * surfaces, prefer the org's logo_url via useOrgBranding and fall back to this.
 */
export function ProMovesLogo({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight text-brand-600', className)}>
      ProMoves
    </span>
  );
}

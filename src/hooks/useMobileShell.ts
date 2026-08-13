import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { isPwaActive } from '@/lib/pwa';

/**
 * Single gate for the mobile shell (tab bar, sidebar-free layout, mobile-only
 * page variants). True only when BOTH: viewport <768px (useIsMobile) AND the
 * user is PWA-flagged (staff.pwa_enabled or the pwa_v1 localStorage dev flag,
 * via isPwaActive). Non-flagged mobile users and all desktop users keep the
 * current sidebar layout unchanged.
 *
 * Every mobile-shell conditional in the app should route through this hook
 * rather than re-deriving the check, so gating stays centralized.
 * See docs/features/mobile-build-instructions.md, Ground rule 1.
 */
export function useMobileShell(): boolean {
  const isMobile = useIsMobile();
  const { pwaEnabled } = useAuth();
  return isMobile && isPwaActive(pwaEnabled);
}

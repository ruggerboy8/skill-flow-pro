import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { isPwaActive, registerPwaServiceWorker, applyPendingUpdate } from '@/lib/pwa';
import { InstallBanner } from './InstallBanner';

/**
 * Orchestrates per-user PWA activation (docs/features/pwa-push-notifications.md D2):
 * when the signed-in user is flagged (staff.pwa_enabled or the pwa_v1
 * localStorage flag), registers the service worker and shows the full-screen
 * install takeover. The update toast is the reload path in standalone mode, where
 * there is no browser refresh button.
 */
export function PwaManager() {
  const { user, pwaEnabled } = useAuth();
  const active = !!user && isPwaActive(pwaEnabled);

  useEffect(() => {
    if (!active) return;
    registerPwaServiceWorker(() => {
      toast({
        title: 'Update available',
        description: 'A new version of Pro Moves is ready.',
        duration: 1000 * 60 * 60,
        action: (
          <ToastAction altText="Refresh now" onClick={() => applyPendingUpdate()}>
            Refresh
          </ToastAction>
        ),
      });
    });
  }, [active]);

  if (!active) return null;
  return <InstallBanner />;
}

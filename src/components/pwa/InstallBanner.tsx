import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { isStandalone, isBannerDismissed, dismissBanner, setDeviceOptOut } from '@/lib/pwa';
import { InstallInstructions } from './InstallInstructions';

/**
 * First-run bottom banner prompting flagged users to install Pro Moves to
 * their home screen. Only renders for PWA-active users (gated by
 * PwaManager), on mobile, outside standalone mode.
 *
 * Dismissal is permanent, not a 7-day re-nag (MOB-2 reframe) — the help is
 * no longer only here. It's also always reachable via the persistent
 * "Install the app" row in the avatar menu (MoreMenuRows), so this banner
 * doesn't need to chase the user again after they've closed it once.
 */
export function InstallBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(isBannerDismissed());

  if (!isMobile || dismissed || isStandalone()) return null;

  const handleDismiss = () => {
    dismissBanner();
    setDismissed(true);
  };

  const handleSharedDevice = () => {
    setDeviceOptOut();
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-md rounded-xl border bg-background shadow-lg p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <p className="font-medium">Get the Pro Moves app</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-1" onClick={handleDismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2">
          <InstallInstructions />
        </div>

        <button
          type="button"
          onClick={handleSharedDevice}
          className="mt-3 text-2xs text-muted-foreground underline underline-offset-2"
        >
          Shared device? Never show app prompts here
        </button>
      </div>
    </div>
  );
}

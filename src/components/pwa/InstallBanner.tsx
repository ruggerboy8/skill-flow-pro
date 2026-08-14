import { useEffect, useState } from 'react';
import { X, Share, PlusSquare, Download, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  isStandalone,
  isIos,
  isIosSafari,
  isBannerDismissed,
  dismissBanner,
  getDeferredInstallPrompt,
  onInstallPromptAvailable,
  triggerInstallPrompt,
  setDeviceOptOut,
} from '@/lib/pwa';

/**
 * Prompts flagged users to install Pro Moves to their home screen.
 * Only renders for PWA-active users (gated by PwaManager), on mobile,
 * outside standalone mode. Instructions deliberately lead with removing
 * the old bookmark icon — pre-PWA icons are plain bookmarks that can
 * never receive push, and there is no upgrade path (doc section B1).
 */
export function InstallBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(isBannerDismissed());
  const [canPrompt, setCanPrompt] = useState(!!getDeferredInstallPrompt());
  const [copied, setCopied] = useState(false);
  const [clipboardFailed, setClipboardFailed] = useState(false);

  useEffect(() => onInstallPromptAvailable(() => setCanPrompt(true)), []);

  if (!isMobile || dismissed || isStandalone()) return null;

  const handleDismiss = () => {
    dismissBanner();
    setDismissed(true);
  };

  const handleSharedDevice = () => {
    setDeviceOptOut();
    setDismissed(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setClipboardFailed(false);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API unavailable or denied (common in some iOS in-app
      // webviews) — fall back to a visible, selectable URL instead.
      setClipboardFailed(true);
    }
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

        <div className="mt-2 text-sm text-muted-foreground space-y-2">
          <p>
            Already have a Pro Moves icon on your home screen? <span className="font-medium text-foreground">Delete it first</span> — it's
            an old bookmark and can't receive notifications.
          </p>
          {isIosSafari() ? (
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Tap the Share button <Share className="inline h-4 w-4 align-text-bottom" /> in Safari
              </li>
              <li>
                Choose <span className="font-medium text-foreground">Add to Home Screen</span>{' '}
                <PlusSquare className="inline h-4 w-4 align-text-bottom" />
              </li>
              <li>Open Pro Moves from your home screen and sign in</li>
            </ol>
          ) : isIos() ? (
            <>
              {/* iOS + any non-Safari browser (Chrome/Firefox/Edge/etc.):
                  Apple restricts PWA installability to Safari on iOS, so the
                  share-sheet steps above don't apply here — route the user
                  to Safari instead. */}
              <p>On iPhone and iPad, Pro Moves can only be installed from Safari.</p>
              {clipboardFailed ? (
                <p className="rounded-md border bg-muted px-2 py-1.5 text-xs text-foreground select-all break-all">
                  {window.location.origin}
                </p>
              ) : (
                <Button size="sm" variant="outline" className="w-full" onClick={handleCopyLink}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5" /> Link copied — now paste it in Safari
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" /> Copy link for Safari
                    </>
                  )}
                </Button>
              )}
            </>
          ) : canPrompt ? (
            <Button size="sm" className="w-full" onClick={() => triggerInstallPrompt()}>
              Install Pro Moves
            </Button>
          ) : (
            <p>Open your browser menu and choose "Add to Home screen" or "Install app".</p>
          )}
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

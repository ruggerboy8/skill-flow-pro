import { useEffect, useState } from 'react';
import { Share, PlusSquare, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isIos,
  isIosSafari,
  getDeferredInstallPrompt,
  onInstallPromptAvailable,
  triggerInstallPrompt,
  getInstallPathway,
} from '@/lib/pwa';

/**
 * The "how to install" steps, shared by the first-run bottom banner
 * (InstallBanner) and the persistent avatar-menu entry point (MOB-2) so the
 * two surfaces render identical content and can never drift apart. Branch
 * selection is delegated to the pure `getInstallPathway()` in
 * src/lib/pwa.ts; the copy itself is carried over verbatim from the
 * pre-MOB-2 InstallBanner (see the spec's risk note — this branching is
 * subtle and easy to regress).
 *
 * Deliberately leads with removing the old bookmark icon — pre-PWA icons
 * are plain bookmarks that can never receive push, and there is no upgrade
 * path (doc section B1).
 */
export function InstallInstructions() {
  const [canPrompt, setCanPrompt] = useState(!!getDeferredInstallPrompt());
  const [copied, setCopied] = useState(false);
  const [clipboardFailed, setClipboardFailed] = useState(false);

  useEffect(() => onInstallPromptAvailable(() => setCanPrompt(true)), []);

  const pathway = getInstallPathway({ isIosSafari: isIosSafari(), isIos: isIos(), canPrompt });

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
    <div className="text-sm text-muted-foreground space-y-2">
      <p>
        Already have a Pro Moves icon on your home screen? <span className="font-medium text-foreground">Delete it first</span> — it's
        an old bookmark and can't receive notifications.
      </p>
      {pathway === 'ios-safari' ? (
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
      ) : pathway === 'ios-other-browser' ? (
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
      ) : pathway === 'android-prompt' ? (
        <Button size="sm" className="w-full" onClick={() => triggerInstallPrompt()}>
          Install Pro Moves
        </Button>
      ) : (
        <p>Open your browser menu and choose "Add to Home screen" or "Install app".</p>
      )}
    </div>
  );
}

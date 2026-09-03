import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { isStandalone, isBannerDismissed, dismissBanner, setDeviceOptOut } from '@/lib/pwa';
import { InstallInstructions } from './InstallInstructions';

/**
 * First-run full-screen takeover prompting flagged users to install Pro
 * Moves to their home screen. Only renders for PWA-active users (gated by
 * PwaManager), on mobile, outside standalone mode.
 *
 * Deliberately a takeover rather than a dismissable corner banner (rollout
 * decision, 2026-09-03): the upgrade only sticks if people actually delete
 * the old bookmark and re-install, so the prompt has to be hard to ignore.
 * Dismissal is still available but intentional — a labeled "keep using the
 * classic version" action at the bottom, not an X to reflex-tap. Escape and
 * outside-interaction closing are disabled for the same reason; the two
 * labeled actions are the only ways out.
 *
 * Built on the Radix dialog primitive (not a bare positioned div) so focus
 * is moved into and trapped inside the takeover and the covered app is made
 * inert — otherwise keyboard/switch-control users could tab through and
 * activate invisible page controls underneath (Codex review on PR #109).
 *
 * Dismissal is permanent, not a 7-day re-nag (MOB-2 reframe) — the install
 * help remains always reachable via the persistent "Install the app" row in
 * the avatar menu (MoreMenuRows), so this screen doesn't need to chase the
 * user again after they've closed it once.
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
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-[100] overflow-y-auto bg-background focus:outline-none"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex min-h-full flex-col px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="my-auto flex w-full flex-col items-center text-center">
              <img
                src="/pwa-192.png"
                alt=""
                className="h-20 w-20 rounded-2xl shadow-lg"
              />
              <p className="mt-6 text-2xs font-semibold uppercase tracking-widest text-primary">
                Something new is here
              </p>
              <DialogPrimitive.Title asChild>
                <h1 className="mt-2 text-3xl font-bold leading-tight">
                  Pro Moves is getting a facelift!
                </h1>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description asChild>
                <p className="mt-3 max-w-md text-muted-foreground">
                  The new Pro Moves is built for your phone and lives on your
                  home screen. Set it up in under a minute:
                </p>
              </DialogPrimitive.Description>
              <div className="mt-6 w-full max-w-md rounded-xl border bg-card p-4 text-left shadow-sm">
                <InstallInstructions />
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-sm text-muted-foreground underline underline-offset-4"
              >
                Not now, keep using the classic version
              </button>
              <button
                type="button"
                onClick={handleSharedDevice}
                className="text-2xs text-muted-foreground/70 underline underline-offset-2"
              >
                Shared device? Never show app prompts here
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

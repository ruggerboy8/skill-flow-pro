// PWA activation gating + service worker registration.
// The manifest and service worker ship to everyone, but nothing activates
// unless this user is flagged: staff.pwa_enabled in the DB (rollout lever)
// or the pwa_v1 localStorage flag (dev loop, same pattern as eval_review_v2).
// See docs/features/pwa-push-notifications.md (D2).

const LOCAL_FLAG_KEY = 'pwa_v1';
const DEVICE_OPTOUT_KEY = 'pwa_device_optout';
const BANNER_DISMISSED_KEY = 'pwa_banner_dismissed_at';
const BANNER_REDISPLAY_DAYS = 7;

let registered = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

// Captured at module load so we don't miss the (early-firing) Android install
// prompt event before the banner mounts.
let deferredInstallPrompt: any = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    promptListeners.forEach((fn) => fn());
  });
}

export function isLocallyFlagged(): boolean {
  try {
    return localStorage.getItem(LOCAL_FLAG_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Shared-device affordance: this browser never activates PWA behavior. */
export function isDeviceOptedOut(): boolean {
  try {
    return localStorage.getItem(DEVICE_OPTOUT_KEY) === 'on';
  } catch {
    return false;
  }
}

export function setDeviceOptOut(): void {
  try {
    localStorage.setItem(DEVICE_OPTOUT_KEY, 'on');
  } catch {
    /* storage unavailable — nothing to do */
  }
}

/** The single gate: profile flag or local dev flag, minus device opt-out. */
export function isPwaActive(profileEnabled: boolean): boolean {
  return !isDeviceOptedOut() && (profileEnabled || isLocallyFlagged());
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function getDeferredInstallPrompt(): any {
  return deferredInstallPrompt;
}

export function onInstallPromptAvailable(fn: () => void): () => void {
  promptListeners.add(fn);
  return () => promptListeners.delete(fn);
}

export async function triggerInstallPrompt(): Promise<void> {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
}

export function isBannerDismissed(): boolean {
  try {
    const at = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!at) return false;
    const elapsedDays = (Date.now() - Number(at)) / (1000 * 60 * 60 * 24);
    return elapsedDays < BANNER_REDISPLAY_DAYS;
  } catch {
    return false;
  }
}

export function dismissBanner(): void {
  try {
    localStorage.setItem(BANNER_DISMISSED_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — nothing to do */
  }
}

/**
 * Register the service worker (prod builds only). Idempotent.
 * onNeedRefresh fires when a new build is waiting; call applyPendingUpdate()
 * to swap and reload — this is the reload path in standalone mode, where
 * there is no browser refresh button.
 */
export async function registerPwaServiceWorker(onNeedRefresh: () => void): Promise<void> {
  if (registered) return;
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) {
    console.info('[pwa] dev mode: service worker registration skipped');
    return;
  }
  registered = true;
  const { registerSW } = await import('virtual:pwa-register');
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh,
  });
}

export function applyPendingUpdate(): void {
  updateServiceWorker?.(true);
}

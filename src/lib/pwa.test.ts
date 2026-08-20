import { describe, it, expect, beforeEach } from 'vitest';
import { getInstallPathway, isBannerDismissed, dismissBanner } from './pwa';

describe('getInstallPathway', () => {
  it('routes iOS Safari to the share-sheet steps', () => {
    expect(getInstallPathway({ isIosSafari: true, isIos: true, canPrompt: false })).toBe('ios-safari');
  });

  it('routes iOS Safari to the share-sheet steps even if a beforeinstallprompt was somehow captured', () => {
    // iOS Safari never fires beforeinstallprompt, but the branch order
    // should still prefer the iOS-Safari path if canPrompt were ever true.
    expect(getInstallPathway({ isIosSafari: true, isIos: true, canPrompt: true })).toBe('ios-safari');
  });

  it('routes iOS non-Safari (Chrome/Firefox/Edge on iOS) to the "open in Safari" copy', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: true, canPrompt: false })).toBe('ios-other-browser');
  });

  it('routes iOS non-Safari to "open in Safari" even with a captured prompt, since iOS cannot install outside Safari', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: true, canPrompt: true })).toBe('ios-other-browser');
  });

  it('routes non-iOS with a captured beforeinstallprompt to the one-tap Android button', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: false, canPrompt: true })).toBe('android-prompt');
  });

  it('falls back to manual "Add to Home screen" instructions when nothing else applies', () => {
    expect(getInstallPathway({ isIosSafari: false, isIos: false, canPrompt: false })).toBe('manual');
  });
});

describe('banner dismissal (MOB-2: permanent, no 7-day re-nag)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is not dismissed before dismissBanner() is called', () => {
    expect(isBannerDismissed()).toBe(false);
  });

  it('stays dismissed after dismissBanner(), with no time-based expiry', () => {
    dismissBanner();
    expect(isBannerDismissed()).toBe(true);
  });

  it('is unaffected by an old timestamp-shaped value from the pre-MOB-2 7-day scheme', () => {
    // Old key stored a raw millisecond timestamp; new code only recognizes
    // the literal 'on' sentinel, so any leftover legacy value reads as "not
    // dismissed" rather than crashing or misinterpreting the number.
    localStorage.setItem('pwa_banner_dismissed', String(Date.now()));
    expect(isBannerDismissed()).toBe(false);
  });
});

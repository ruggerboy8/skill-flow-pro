# Spec: MOB-2, persistent self-serve "Install the app" affordance

**Status:** draft, awaiting John's approval
**Lane:** medium (mobile UI + copy; no DB, no telemetry)
**Ticket:** MOB-2 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-2-install-affordance
**Spec:** this file
**DB change:** none (and deliberately so — see below)
**Personas to test as:** participant, lead (both on a flagged mobile browser, non-standalone and standalone)
**Depends on:** soft dependency on MOB-1 (the avatar menu is the natural persistent entry point). Can ship first with a standalone entry point if MOB-1 lands later.

## What and why

The PWA plan originally shipped a three-stage **verification funnel** — an
`staff_devices` telemetry table, `push_subscriptions`/`notification_log`
tracking, and a super-admin dashboard to chase who had installed the app at
huddles (`pwa-push-notifications.md` §F). The skeleton (§1 Rollout, John
2026-08-20) **drops that funnel and the `staff_devices` table entirely.** We do
not need to track installs.

In its place: **anyone still on the old browser (non-standalone) site always
sees a small, persistent, self-serve "Install the app" affordance** that teaches
them to set it up properly — delete the old home-screen bookmark icon, re-add
from Safari, sign in. It is always available, carries no roster or telemetry,
and **disappears the moment the app detects it is running standalone.**

The good news for scope: the telemetry was never actually built. A grep for
`staff_devices` across `src/` and `supabase/` returns nothing, and `src/lib/pwa.ts`
writes no device rows. So this ticket is a **reframe of the existing install
banner**, not a teardown. Today `src/components/pwa/InstallBanner.tsx` is a
*dismissable* bottom banner with a 7-day redisplay timer
(`isBannerDismissed` / `dismissBanner` in `src/lib/pwa.ts`). A dismiss-and-
re-nag-in-7-days mechanic reads faintly like the chasing the skeleton wants gone.
The reframe makes the help **persistent and self-serve**: always reachable, never
chasing.

## Scope

**In:**
- Make the install help **persistently reachable** while non-standalone: a
  stable "Install the app" entry point that reopens the full instructions on
  demand, in addition to (or in place of) the transient bottom banner.
- The affordance renders only when `!isStandalone()` and hides entirely once
  standalone.
- Keep the existing correct copy: delete-the-old-icon-first, the iOS-Safari-only
  path, the Android `beforeinstallprompt` one-tap, and the generic fallback
  (all already in `InstallBanner.tsx`).
- Keep the cheap **shared-device opt-out** (`setDeviceOptOut` / `isDeviceOptedOut`
  in `src/lib/pwa.ts`), which the skeleton and PWA decisions log (#6) both keep.

**Out:**
- **Any install/subscribe/ack telemetry.** No `staff_devices` table, no
  verification dashboard, no `notification_log` — explicitly dropped (§1, §6).
- Push subscription (that is MOB-9's capability-only work; no subscription flow
  here either).
- The install-icon art itself (`public/brand/alcan-icon.svg` placeholder is a
  separate open item in the PWA doc's decisions log).

## Approach (grounded in the real files)

1. **`src/lib/pwa.ts`** already provides everything needed to gate the
   affordance: `isStandalone()`, `isIos()`, `isIosSafari()`, `isDeviceOptedOut()`,
   `getDeferredInstallPrompt()` / `onInstallPromptAvailable()` /
   `triggerInstallPrompt()`. No new detection logic required.

2. **Persistent entry point.** The cleanest home is a row in the **MOB-1 avatar
   menu** — "Install the app" — shown only when `!isStandalone() &&
   !isDeviceOptedOut()`. Tapping it opens the existing install instructions (the
   body of `InstallBanner.tsx`, extracted into a shared `InstallInstructions`
   component so the banner and the menu row render the same content). This makes
   the help always one tap away regardless of banner dismissal.

3. **The banner.** Keep the first-run bottom banner from `InstallBanner.tsx`
   (`PwaManager` already renders it for PWA-active, non-standalone mobile users),
   but change its dismissal semantics: dismissing should hide the *banner* for the
   session without starting a 7-day "we'll nag you again" timer — because the
   persistent menu entry point now guarantees the help is never lost. Recommend
   retiring `BANNER_REDISPLAY_DAYS` / `isBannerDismissed` in favor of a simple
   session-scoped hide, or removing the auto-redisplay entirely. (Confirm with
   John which he prefers — see open question.)

4. **`src/components/pwa/PwaManager.tsx`** stays the orchestrator: it already
   only mounts install UI when `isPwaActive(pwaEnabled)` and the user is signed
   in. No gating change; it just renders the reframed affordance.

## Acceptance criteria (behavioral, testable)

1. On a flagged mobile browser **not** in standalone mode, an "Install the app"
   affordance is reachable at all times (via the avatar menu), and its
   instructions lead with "delete your old Pro Moves icon first."
2. On iOS **Safari**, the instructions show the Share → Add to Home Screen steps;
   on iOS **non-Safari** (Chrome/Firefox/Edge), they show the "can only install
   from Safari" copy with the copy-link button; on Android with a captured
   `beforeinstallprompt`, a one-tap "Install Pro Moves" button appears. (All
   three paths already exist in `InstallBanner.tsx`; verify they survive the
   refactor.)
3. Once the app is launched in **standalone** mode, the affordance is gone
   everywhere — no banner, no menu row.
4. "Shared device? Never show app prompts here" still permanently suppresses the
   affordance on that browser via `setDeviceOptOut()`.
5. No network write occurs on install, dismissal, or standalone detection — the
   feature reads zero and writes zero rows (confirm in the network panel).
6. Non-flagged and desktop users see no change.

## Files touched

- `src/components/pwa/InstallBanner.tsx` — extract the instruction body into a
  shared `InstallInstructions` component; adjust dismissal semantics.
- `src/lib/pwa.ts` — likely remove/relax `BANNER_REDISPLAY_DAYS` /
  `isBannerDismissed` / `dismissBanner`; keep everything else.
- The MOB-1 avatar menu component — add the conditional "Install the app" row.
- `src/components/pwa/PwaManager.tsx` — minor, if the render shape changes.

## Risks / blast radius

- Confined to PWA-active mobile users (the flagged cohort). Cannot affect the
  67 non-flagged staff.
- The iOS-Safari-vs-other-browser branching is subtle and already correct in the
  current banner; the risk is regressing it during extraction. Mitigation: the
  shared component keeps the exact `isIosSafari()` / `isIos()` / `canPrompt`
  branch logic verbatim.
- If MOB-1 has not landed, MOB-2 needs a temporary standalone entry point (e.g.
  keep the persistent banner) until the avatar menu exists.

## Open question for John

1. **Banner behavior after dismiss.** Now that the help is persistent in the
   menu, do you want the first-run bottom banner to (a) never auto-reappear once
   dismissed (relying on the menu), or (b) reappear each new session until
   installed? (a) is calmer and more in the skeleton's spirit; (b) is more
   insistent for the rollout ramp. Recommend (a).

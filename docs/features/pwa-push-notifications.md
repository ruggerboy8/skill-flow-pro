# PWA Conversion + Push Notifications

**Status:** v0.3, 2026-08-13. ALL OPEN QUESTIONS ANSWERED by John
2026-08-13; decisions folded in below. Summary: Track B (mobile design
revamp) is a GO at prototype level, designed together in a controlled
environment before any user sees it, with a design-agent-led principles
pass first (see H). Test user is **"testing tester"**, already in the
system, already flagged as a lead. Deputy explicitly out of scope for the
test. Verification funnel panel is super-admin only. Notifications ship
all-on (no preferences UI) until more notification kinds exist. The
shared-device "don't subscribe this device" affordance is included since it
is cheap. Rollout: single-user test → all locations (no intermediate pilot
location). Immediate work: build everything needed for the single-user
test, plus clickable design prototyping, since John wants to see and click
through everything. Companion doc: `ask-alcan-assistant.md`.

**The pitch in one line:** make Pro Moves installable on every staff phone
with a home-screen icon and real push notifications, without leaving the
current Vite + React + Lovable + Supabase stack and without app stores.

Grounding facts (verified in repo 2026-08-13):

- No manifest, no service worker today; plain browser SPA.
- **Login is password-based** (`Login.tsx` uses `signInWithPassword`). This
  is the good case for an installed PWA; see B2.
- Invite and password-reset emails link to `SITE_URL/auth/callback` and
  `/reset-password` (`admin-users` function). Those links will open in
  Safari, not the installed app; see B2.
- **Deputy integration already exists and syncs shifts**: `deputy-sync`
  pulls per-person timesheets weekly for excusals, with an explicit rule
  that a "ghost week" (zero shifts) is inconclusive because PRN/casual staff
  work unscheduled. Reminder gating can reuse this; see E1.
- Layout audit: `Layout.tsx` uses `min-h-screen` + a sticky top header
  (both safe when installed); wizards use `min-h-screen` (safe); ~34
  vh-style usages are almost all `min-h-screen`; no `safe-area-inset`
  handling anywhere; viewport meta has no `viewport-fit=cover` (acceptable
  default, see B4).

---

## A. Why PWA (and not a store app)

- Home-screen icon, full-screen launch, feels like "the Pro Moves app."
- **Push notifications work**: Android for years; iOS since 16.4 for PWAs
  added to the home screen.
- No Apple developer account, no review, no second release channel. Lovable
  publish flow unchanged; the SW and manifest are build artifacts.
- Capacitor stays available later as a drop-in escalation. All tables,
  senders, and triggers in this doc carry forward unchanged.

## B. What actually changes for users (the honest consequences list)

This is the "do it right from the beginning" section. Each item is either a
Phase 1 work item or an explicit accepted behavior.

1. **Existing home-screen icons are dead weight and must be replaced.** An
   iOS home-screen icon bakes in its behavior at the moment it was added.
   Icons added before we ship the manifest are plain bookmarks: they open in
   Safari chrome and can never receive push. There is no upgrade path.
   **The install instructions must say: delete the old Pro Moves icon, then
   re-add from Safari.** Android similar: old shortcuts remain shortcuts;
   proper install creates the real app. This goes in the launch
   comms, the in-app install banner copy, and the huddle script.
2. **Everyone logs in once more, inside the installed app.** The installed
   PWA has its own storage, separate from Safari, so Safari sessions don't
   carry over. Because login is password-based this is a one-time
   sign-in (iOS password autofill works in installed PWAs). Two flows to
   handle deliberately:
   - Invite and reset links open in Safari, not the installed app. That is
     fine: the user completes password setup in Safari, then opens the
     installed app and logs in. Add one sentence to the invite/reset email
     templates and the reset-password success screen ("Now open the Pro
     Moves app on your home screen and sign in").
   - Session longevity: Supabase refresh tokens persist in the installed
     app's storage, so day-to-day staff stay signed in. Verify token
     refresh works after multi-day idle on a real device (test item).
3. **No browser chrome means no back button and no reload on iOS.**
   (Android keeps system back gesture.) Consequences:
   - Every mobile-reachable page needs an in-app way backward. Audit the
     staff surface set (C) for dead ends; sheets/drawers/wizards already
     have their own close/back affordances.
   - A crashed or errored screen has no refresh. The error boundary (or a
     minimal one, if none exists on the staff routes) must render a
     "Reload" button. The SW update toast ("new version available, tap to
     refresh") is the normal reload path after each Lovable publish.
4. **Status bar and notch.** With the default viewport (no
   `viewport-fit=cover`) iOS insets the app below the status bar
   automatically and shows the page background behind it. With our
   background tokens this should look fine, and it means zero safe-area CSS
   work in v1. Set manifest `theme_color`/`background_color` from design
   tokens, verify on a notched iPhone, and only reach for
   `viewport-fit=cover` + `env(safe-area-inset-*)` padding if it looks
   wrong. Decision recorded either way.
5. **External links** (Basecamp links, meeting links) open in an in-app
   Safari overlay with a Done button. Acceptable; no work.
6. **File outputs need a device test.** jsPDF exports and CSV downloads
   behave differently in standalone (preview/share sheet instead of a
   downloads bar). Test the export paths staff actually use on mobile; admin
   exports stay desktop (C).
7. **Mic and audio.** getUserMedia works in installed PWAs on iOS 16.4+,
   but if any staff-facing flow records audio on mobile, it gets a device
   test before launch.
8. **Silent unsubscribe.** Deleting the icon kills the push subscription
   with no signal. The sender must prune on 404/410 delivery failures, and
   the admin funnel view (F) will show these as drop-offs rather than
   mystery.

## C. Mobile surface policy (so we do this deliberately, not haphazardly)

Two tiers instead of pretending the whole app is mobile-ready.

**Tier 1, mobile-supported — confirmed with John 2026-08-13.** Everything a
staff member / participant needs, plus the lead RDA layer (leads are
primarily phone users). Concrete route list from `App.tsx`:

| Surface | Routes / components |
|---|---|
| Login + auth | `/login`, `/reset-password`, `/setup-password`, `/welcome` |
| Home | `/` (Index) including **lead cards**: `ThisWeekPanel`, `LeadFocusHomeCard`, `LeadMeetingRequestCard` and every state they render (lead content lives on home as cards, not separate routes) |
| Check-in | `/confidence/:week/step/:n` (ConfidenceWizard) |
| Check-out | `/performance/:week/step/:n` (PerformanceWizard) |
| My Role | `/my-role` + children: overview (RoleRadar), `practice-log` / `focus` / `history` (PracticeLog), `evaluations` (StatsEvaluations); `/my-role/domain/:domainSlug` (DomainDetail) |
| History → evaluations | the full path from the history panel into `/evaluation/:evalId` (EvaluationViewer) |
| Surveys | `/survey/:id` (SurveyTakePage) — staff take these on phones |
| Profile | `/profile` |

**Tier 2, desktop-intended (explicitly out of scope for mobile polish):**
admin, facilitation, eval capture/results, coach workspace, clinical/doctor
surfaces, builder, integrations config. These keep working in any browser;
they are not part of the mobile acceptance pass, and nothing about the PWA
changes them. (If lead RDAs are later granted coach-surface access, that
surface graduates to Tier 1 then, not preemptively.)

Phase 1 acceptance = every Tier 1 route walked on an installed iPhone and
Android, checking: no dead ends (B3), keyboard doesn't break layout in the
wizards, header/status bar looks right (B4), exports behave (B6), and lead
card states verified with a lead-flagged user. Findings become the Phase 1
punch list.

## D. Phase 1: installability + app adjustments

1. `vite-plugin-pwa`: manifest (name "Pro Moves", standalone display,
   tokens for theme/background, 192/512 icons + Apple touch icon from
   `public/brand`), Workbox SW.
2. SW caching policy: **network-first, app shell only.** Do not cache
   Supabase API responses in v1; stale data is worse than a spinner. The SW
   exists to make the app installable and to receive push.
3. Update toast wired to the `vite-plugin-pwa` refresh hook (the reload
   path, B3).
4. Error boundary with Reload on staff routes (B3).
5. Invite/reset email + screen copy tweak (B2).
6. In-app install banner on mobile browsers: Android one-tap via
   `beforeinstallprompt`; iOS share-sheet instructions; **both versions
   include "remove your old Pro Moves icon first"** (B1).
7. Tier 1 device audit and resulting fixes (C).
8. Verify the Lovable publish emits SW + manifest on the live site before
   any announcement.

## D2. Single-user test rollout (before any live users)

John's requirement: the PWA reaches exactly one test user first. The
mechanics of gating a PWA need care, because the manifest and service
worker are site-wide artifacts once published. The plan follows the house
conservative-migration pattern (build alongside, gate activation):

1. **Publishing is inert.** The manifest and SW ship to production, but the
   SW uses network-first with app-shell-only caching, so browser users see
   zero behavior change. Nothing installs itself; nobody is prompted.
2. **Activation is flagged per user.** SW registration, the install banner,
   and the notification onboarding card all check a flag before doing
   anything:
   - Dev loop: a `pwa_v1` localStorage flag (same pattern as
     `eval_review_v2`) so John can test on his own devices pre-DB.
   - Test rollout: a `staff.pwa_enabled` boolean (or equivalent allowlist),
     admin-togglable, so the flag follows the test user across devices.
     The same flag later does the staged rollout: test user → pilot
     location → org default-on.
3. **Test user: "testing tester"** (decided 2026-08-13). Already exists in
   the system and is flagged `is_lead = true`, so one account exercises
   both the participant loop and the lead home cards. Verify they have
   current-week assignments and at least one released evaluation so
   check-in, check-out, My Role, history, and the evaluation viewer all
   render real data; seed if missing. No Deputy mapping — accepted;
   Deputy-gated reminders are Phase 3 and untestable for this user by
   design.
4. **Honest caveat:** the manifest being live means a determined user could
   technically add-to-home-screen early and get standalone mode. Without
   instructions nobody will, and the worst case is they get the app shell
   early with no push. Push can never activate without the flag.

Test pass = the full funnel (F) end to end on the test user: delete old
icon, install, log in, allow notifications, receive and ack the hello push,
then walk every Tier 1 route installed.

## E. Phase 2: push infrastructure

**Data model** (additive):

- `push_subscriptions`: id, staff_id, endpoint (unique), p256dh, auth,
  user_agent, created_at, last_seen_at, failed_at. RLS: staff own their
  rows; service role reads all.
- `notification_log`: id, staff_id, kind, title, body, url, sent_at,
  delivered, error, **acked_at** (powers the verification funnel, F).
- `notification_preferences`: staff_id, kind, enabled (default on). Can
  ship in v1 as table-only with UI later (open question 4).
- `staff_devices` (lightweight): staff_id, first_seen_standalone_at,
  last_seen_standalone_at, user_agent. Written by the client when
  `display-mode: standalone` matches at login. This is how we count
  *installed* separately from *subscribed* (F).

**Keys:** one VAPID keypair; public key in client, private key only in edge
function secrets.

**Client:** onboarding card after login in the installed app: "Turn on
notifications" tap → `Notification.requestPermission()` →
`pushManager.subscribe()` → upsert subscription. SW `push` handler shows
notifications; `notificationclick` deep-links.

**Sender:** `send-push` edge function (service role): input staff_ids +
payload; signs with VAPID (`web-push` via npm specifier in Deno); logs every
send; prunes dead subscriptions on 404/410.

## F. Launch verification funnel ("say hi to Johno")

John's requirement: launch is a tracked test, not a hope. The funnel has
three measured stages per staff member, visible on one admin panel:

1. **Installed** — `staff_devices` row exists (standalone detected at
   login). Catches people who re-added the icon and signed in.
2. **Notifications allowed** — `push_subscriptions` row exists.
3. **Confirmed received** — immediately after a successful subscription,
   the server sends the hello push: "You're in! Tap this to say hi to
   Johno." Tapping opens the app to a confirmation route that stamps
   `acked_at` on that notification_log row (and shows something small and
   delightful; confetti is already a dependency).

Admin panel: roster by location with three checkmark columns and counts,
so follow-up at huddles is "these four people, stage 2." No stage is
inferrable from another (permission can be denied after install; a push can
be sent but never seen), which is exactly why all three are tracked.

Launch sequence: publish Phase 1 → pilot group instructions (delete old
icon, re-add, sign in, allow notifications) → watch funnel → org-wide.

## G. Phase 3: the notifications themselves

In value order, with John's notes folded in:

1. **Check-in reminders, Deputy-aware.** Do not remind people on days
   they are not scheduled. `deputy-sync` already fetches per-person shifts
   and already encodes the hard-won rule that zero shifts is inconclusive
   (PRN staff work unscheduled). Proposed policy, to be confirmed against
   check-in policy docs: remind only staff with a Deputy shift today (or
   this week, depending on cadence); staff with ghost weeks get the
   end-of-week reminder only; auto-excused weeks get nothing. This needs a
   short policy pass with John before build (open question 2).
2. **Eval released** (only evals passing the release guard).
3. **Coach notes / nudges** — John explicitly wants these; a coach-to-staff
   note that arrives as a push and lives in the notification log.
4. Later: survey open, assistant answers, schedule-adjacent nudges.

Every notification deep-links to the exact surface it references.

## H. The design question: does the PWA justify a phone-first revamp?

John's question, and the short answer is yes — the PWA does afford a
genuinely better design position, and this is the natural moment to take
it. The reasoning:

- **Standalone mode unlocks patterns that make no sense in a browser tab.**
  The canonical one is a **bottom tab bar** (Home / Check-in / My Role /
  History): thumb-reachable, always visible, the navigation grammar of
  every native app. In a browser it fights the URL bar; in an installed app
  it is simply how the app works. Same for full-bleed layouts, swipe-forward
  wizard steps, and app-like screen transitions.
- **The audience is now known to be phone-first.** Participants and lead
  RDAs live on phones; the desktop sidebar layout they currently get is a
  desktop idiom shrunk down. A participant/lead mobile shell (bottom nav)
  with the desktop layout preserved for Tier 2 users is the honest
  structure for who actually uses what where.
- **Scope stays bounded** because Tier 1 is now a concrete list (C): the
  revamp is those routes and nothing else.

**Recommended structure: two decoupled tracks.**

- **Track A — PWA infrastructure** (this doc, D/D2/E/F): flag-gated,
  testable with the test user, not blocked by any design decision.
- **Track B — participant/lead mobile experience revamp**: bottom-nav shell
  for Tier 1, touch-target and layout pass per route, safe-area-aware.
  Largely a Lovable workstream once specced (its own doc:
  `mobile-experience-revamp.md`, to be written if John green-lights).

Sequencing recommendation: run the Track A device audit first — it produces
the per-route findings that a redesign spec needs anyway — and land Track B
before the *org-wide* rollout so most staff meet the installed app in its
intended form. The single-user test and pilot do not wait for Track B.

## I. Decisions log (was: open questions) — answered 2026-08-13

1. **Track B: GO at prototype level.** Design work happens with John in a
   controlled environment (clickable prototypes he can walk through) before
   anything ships to users. Process: a design-agent-led rigorous pass
   producing a mobile-first design principles document first, because this
   is not "move the sidebar to the bottom" — it is reconsidering how staff
   actually use the app, informed by the Pro Moves philosophy and the
   Alcan one-stop-shop trajectory. Principles doc → reviewed with John →
   clickable prototype → build.
2. **Test user: "testing tester"**, already in system, `is_lead = true`.
   No Deputy for now.
3. Reminder policy: still parked for Phase 3 (Deputy out of scope for the
   current test entirely).
4. Funnel panel: **super-admins only.**
5. Notifications: **all-on**, no preferences UI until the notification set
   grows.
6. Shared devices: **build the "don't subscribe this device" affordance**,
   since it is cheap insurance even if shared devices are uncommon.
7. Rollout: after the single-user test passes, **roll out across all
   locations** (no intermediate pilot).

Remaining open items (not blockers):
- Real app icon: `public/brand/alcan-icon.svg` is a placeholder letter "A";
  proper icon art should land before org-wide rollout (natural Track B
  deliverable).
- Phase 3 reminder policy pass (Deputy-gated rules + cadence) when
  notifications work begins in earnest.

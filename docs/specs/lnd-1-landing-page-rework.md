# LND-1: Landing page rework on the new design system

Status: APPROVED by John 2026-08-20
Lane: medium
Motion ticket: LND-1 on the MyProMoves Dev Board
Date: 2026-08-20

## What and why

The public landing page (route `/`, `src/pages/LandingPage.tsx`, 85 lines) is
a placeholder: a one-line hero ("Coaching that sticks."), three generic
feature cards, and a sign-in button. It predates the brand. Now that the
identity is locked and in the product (DSN-5a/5b) and the motion system is
building (DSN-5c), the landing page should become the brand's front door:
the first thing an outside visitor, a conference attendee typing the URL
from a slide, or a prospective practice sees. It also needs to credit the
parent brand: Pro Moves is Alcan Dental Cooperative's sister brand, and the
page should say so and link to alcandentalcooperative.com.

## Direction (from the brand brief, not invented here)

The brief's promise is "turning a job into a career," its soul is "the
delta" (closing the gap between how you see yourself and how you're
observed), and its judging criteria are modern, premium, considered,
intentional, warm. The page should read as credible next to venture-backed
software while staying warm enough that staff would proudly send it to a
friend.

## Proposed structure (five sections, one page, no routing changes)

1. **Hero.** The Signal P performing its one run-once lap (the DSN-5c
   component in "once" mode, static under reduced motion), the wordmark,
   the promise line "Turning a job into a career," one short supporting
   sentence, and the Sign In button. Copy fix rides along: "Pro Moves,"
   two words, everywhere on the page.
2. **The weekly loop, plainly.** Three steps told as the staff member
   experiences them (check in on confidence, practice three Pro Moves,
   check out on performance), replacing the three generic cards. Domain
   accent colors from the tokens, icons on the size scale.
3. **The delta.** One quiet section for the product's soul: self-view
   versus observed view, and growth living in the gap. Simple visual
   built with score/domain tokens, no chart library.
4. **Who it serves.** One line each for staff, practice leaders, and
   coaches/directors, in the brief's warm register.
5. **Alcan credit + footer.** "Pro Moves is built by Alcan Dental
   Cooperative" with the Alcan logo (already in `public/brand/
   alcan-logo.svg`) linking to https://alcandentalcooperative.com
   (opens in a new tab). Footer keeps the standard small print.

## Build rules

- Design system only: brand/domain/score/status tokens, Biondi type,
  icon size table, `--ease-brand` motion tokens. Zero hardcoded palette
  classes (the ratchet guard enforces this at build time).
- Copy tone: warm, plain, no em dashes, matches the brief's register.
- The page stays a single static route with no data fetching, loads fast,
  and works on a phone (many visitors arrive from a conference slide).
- Depends on DSN-5c's SignalP component for the hero moment. If LND-1
  builds first, the hero uses the static wordmark and the animation drops
  in when 5c lands.
- The Alcan link is the only external link and carries
  `rel="noopener noreferrer"`.

## Acceptance script (for John)

1. Open the app logged out. The landing page shows the Signal P draw
   itself once and settle, then the promise line and Sign In.
2. Read the page top to bottom: the weekly loop, the delta section, who
   it serves. Everything says "Pro Moves" as two words.
3. Bottom of the page: the Alcan Dental Cooperative logo and credit line.
   Clicking it opens alcandentalcooperative.com in a new tab.
4. Resize to phone width (or open on your phone): everything stacks
   cleanly, nothing overflows.
5. With reduce-motion on in OS settings, the hero is static but complete.
6. Sign In still goes to the login page; nothing else in the app changed.

## Personas to test as

Logged-out visitor (the primary audience), plus a quick signed-in check
that no in-app surface regressed (the page shares the ProMovesLogo
component and Button with the app).

## Out of scope

- MyProMoves.com as a separate marketing site (this is the app's own
  public page; a standalone marketing site is a future effort).
- Testimonials, pricing, screenshots of the app, demo-request forms
  (nothing here should require content John hasn't written or approved).
- Any change to login, auth, or routing.
- The co-brand lockup as a drawn asset (kit "not yet built" item; the
  credit section uses the existing Alcan logo file plus text. If John
  wants the drawn lockup, that is a small brand-kit task first).

## DB impact

None.

## Docs the builder must read

| Area | Docs |
|---|---|
| Brand truth | `promoves-brand/brand-brief.md`, `promoves-brand/exports/README.md` |
| Motion | `docs/dev/motion-rules.md` (lands with DSN-5c), motion contract in the kit README |
| App conventions | CLAUDE.md design conventions, `docs/dev/token-migration-pattern.md` |
| Anything | `docs/system-overview.md`, `docs/glossary.md` (the weekly loop, check-in/out) |

# DSN-8: Pro Moves branding presence in the app (org logo keeps the top spot)

Status: APPROVED by John 2026-08-20
Lane: medium
Motion ticket: DSN-8 on the MyProMoves Dev Board
Date: 2026-08-20

## What and why

After DSN-5b, the Pro Moves wordmark appears on every pre-auth screen, but
inside the app the header's marquee slot cascades org logo, then org name,
then Pro Moves as a last resort. So an Alcan user (today, every user) never
sees the product mark in the chrome at all. John's direction, 2026-08-20:
the org's logo keeps the big top spot, and Pro Moves branding gets a decent
number of guaranteed places that show regardless of org. The product
identity and the org identity are both present, in different roles: the org
is whose practice this is, Pro Moves is what the tool is.

## The rule this establishes

One marquee slot, org-first: the top-center header logo stays the org's
(cascade unchanged). Everything else brand-shaped in the app is Pro Moves,
always, for every org.

## Guaranteed Pro Moves placements (the work)

1. **Desktop header, secondary position.** A small Pro Moves wordmark in
   the header's right-side cluster (near the profile button), sized to the
   text-sm scale, quiet, always present. The org logo stays center stage.
2. **Mobile shell header.** Already ships the Alcan-logo-plus-wordmark
   pairing from DSN-5b. Cleanup rides along: the mobile header hardcodes
   the Alcan logo file; switch it to the same org cascade the desktop
   header uses (org logo_url, then org name, then nothing) so a future
   non-Alcan org never sees Alcan's mark. The wordmark half stays fixed.
3. **Avatar menu footer.** The profile/avatar dropdown gets a quiet footer
   row: small Pro Moves wordmark. The one place every user visits weekly
   (sign out, profile) always carries the product mark.
4. **Loading states.** Already guaranteed by DSN-5c: the Signal P loader
   is inherently org-independent. No extra work, listed for completeness.
5. **Pre-auth, favicon, PWA icon, share card.** Already done (DSN-5b).
   Listed so this spec reads as the complete inventory of product-branding
   surfaces.

## Deliberately NOT included (flag if wanted)

- Signal P flourishes on ritual completion moments (finishing a check-in
  or check-out). Charming but belongs to a deliberate delight pass, not a
  branding-presence ticket.
- Watermarks or empty-state decorations.
- Push notification glyph wiring (the asset shipped in 5b; the wiring
  belongs to the push-notifications work).

## Acceptance script (for John)

1. Sign in as any Alcan user on desktop. The Alcan logo holds the top
   center of the header, unchanged. A small Pro Moves wordmark sits
   quietly in the header's right cluster.
2. Open the avatar menu: Pro Moves wordmark in its footer.
3. On the phone shell: org logo and Pro Moves wordmark share the header
   as they do today, and (dev-verifiable) the org half now comes from the
   org's uploaded logo rather than a hardcoded Alcan file.
4. Nothing moved or resized in the existing layouts; the additions are
   quiet and do not crowd the chrome.

## Personas to test as

Participant (mobile PWA), admin (desktop). Both walk their normal home
surfaces looking only at chrome.

## Out of scope

- Any change to the org logo cascade's priority (org stays first, always).
- Landing page (LND-1 owns it), Command Center (DASH owns it).
- Org logo upload/management features.

## DB impact

None.

## Docs the builder must read

| Area | Docs |
|---|---|
| Brand truth | `promoves-brand/brand-brief.md` (the sister-brand relationship) |
| App conventions | CLAUDE.md design conventions, `docs/dev/token-migration-pattern.md` |
| Chrome code | `src/components/Layout.tsx` (both header branches, the org cascade), the avatar menu component |

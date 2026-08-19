# Third-party licenses

This project is proprietary (see `LICENSE`). It uses open-source and
freely-licensed third-party packages, most under standard permissive licenses
(MIT, ISC, Apache-2.0). This file calls out the dependencies that ship under
a non-standard or otherwise notable license, found during a quick pass of
`package.json` in both the root project and `the-alcan-way/`. It is not an
exhaustive license audit.

## GSAP (`the-alcan-way/`)

`the-alcan-way/` (the standalone scroll-driven training experience) depends on
[`gsap`](https://www.npmjs.com/package/gsap) as a production dependency.

GSAP ships under GreenSock's own **Standard "No Charge" license**, not an
SPDX open-source license (MIT, Apache-2.0, etc.):

- Full terms: https://gsap.com/standard-license
- Summary: GSAP may be used at no charge in commercial and non-commercial
  apps, sites, and products, as long as end users are not charged a fee to
  use the product or access it. If a client pays a one-time fee to have the
  site/product built, that still qualifies under the no-charge terms. A
  paid "Club GreenSock" commercial license is required only for products
  where end users are charged a recurring usage/access/license fee.
- `the-alcan-way` is an internal training experience, not sold to end users,
  so it qualifies for the no-charge terms as currently used. If that ever
  changes (e.g. the experience is sold or licensed to third parties for a
  fee), re-check the license terms before shipping.

## Other dependencies noted during the quick pass

- `dompurify` (root `package.json`) is dual-licensed
  (`Apache-2.0 OR MPL-2.0`). This is an SPDX-recognized dual license, not a
  concern, just noted because it isn't a single simple license string.
- `lovable-tagger`, `@lovable.dev/vite-plugin-dev-server-bridge`, and
  `@lovable.dev/vite-plugin-hmr-gate` (root `package.json`, devDependencies)
  are Lovable's own build tooling. `lovable-tagger` is published under MIT.
  The two `@lovable.dev/*` scoped packages did not turn up a clearly
  verifiable published license in this quick pass; they are dev-only
  (not shipped in the production build) and low risk, but worth a closer
  look in a dedicated license-audit ticket if that ever matters.

Everything else in both `package.json` dependency lists (React, Radix UI,
Supabase JS client, Tailwind, Vite, etc.) uses standard MIT, ISC, or
Apache-2.0 licenses.

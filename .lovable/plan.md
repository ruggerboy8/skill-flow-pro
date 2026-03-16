

## Org-Level Email Branding — Schema, Wizard, and Edge Function Changes

### Overview

Each organization needs its own email branding settings so that emails (reminders, scheduling invites, eval releases, meeting summaries) are sent with the correct org name, sign-off, and reply-to. This supports white-label consultants who need their own branding, not "Pro-Moves" or "ALCAN."

### 1. Database: Add branding columns to `organizations`

Add these columns to the `organizations` table:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `email_sign_off` | text | `NULL` | e.g. "The Kids Tooth Team" — used in email footers |
| `reply_to_email` | text | `NULL` | Org-specific reply-to address |
| `app_display_name` | text | `NULL` | How the org refers to itself in UI/emails (e.g. "Pro-Moves", "SkillTrack") |

When `NULL`, edge functions fall back to platform defaults (`Pro-Moves`, the env `RESEND_REPLY_TO`). This keeps existing orgs working without data migration.

We intentionally skip logo upload and accent colors from this plan — those are future features. But the wizard step will be designed so they slot in naturally later.

### 2. Wizard: Add Step 4 "Branding" (shift current "All Set!" to Step 5)

Current steps: Positions → Locations → Schedule → All Set!
New steps: **Positions → Locations → Schedule → Branding → All Set!**

The new **Branding** step collects:

- **Organization display name** — pre-filled from `organizations.name`, editable. "How should we refer to your organization in emails?"
- **Email sign-off** — e.g. "— The Kids Tooth Team". Pre-filled as `The ${org.name} Team`
- **Reply-to email** — "Where should staff replies go?" Optional, falls back to platform default
- *(Future placeholder text: "Logo upload and accent colors coming soon")*

Saves to `organizations` table on "Next."

### 3. Edge Functions: Resolve branding from org context

All 5 email-sending edge functions need the same change pattern:

1. Look up the recipient's organization (via staff → location → practice_group → organization)
2. Use `org.email_sign_off` / `org.app_display_name` / `org.reply_to_email` if set
3. Fall back to env vars / platform defaults if NULL

**Affected functions:**

| Function | Current sign-off | Change |
|---|---|---|
| `notify-meeting-summary` | Hardcoded "The ALCAN Team" | Use `org.email_sign_off` or "The Pro-Moves Team" |
| `coach-remind` | No sign-off in body | Add `org.email_sign_off` |
| `invite-to-schedule` | No sign-off | Add `org.email_sign_off` |
| `notify-eval-release` | Uses org name dynamically (already good) | Add `org.email_sign_off` for footer |
| `admin-users` | No email body sign-off | Add `org.email_sign_off` to invite emails |

For `reply_to`: each function currently reads `RESEND_REPLY_TO` env var. Change to: use `org.reply_to_email` if set, else fall back to env var.

For `from` address: stays as the platform-level Resend sender (you can only send from verified domains). The `from` display name could use `org.app_display_name` — e.g. `${org.app_display_name} <no-reply@mypromoves.com>`.

### 4. Hardcoded URL and fallback fixes (same pass)

While touching these functions, also:

- Replace `alcandentalcooperative.com` fallbacks with `mypromoves.com`
- Replace `alcanskills.lovable.app` fallbacks with `mypromoves.com`
- Replace "The ALCAN Team" with dynamic `org.email_sign_off`
- Fix `SchedulingInviteComposer.tsx` hardcoded URL → `window.location.origin`

### 5. Welcome/SetupPassword pages

Replace "The Alcan team" copy with dynamic org name from the staff profile query (already fetched). Alt text on logos changed to neutral "Pro-Moves" until logo upload is implemented.

### Files changed

| File | Change |
|---|---|
| **Migration SQL** | Add `email_sign_off`, `reply_to_email`, `app_display_name` to `organizations` |
| `OrgSetupWizard.tsx` | Add Step 4 "Branding", shift completion to Step 5 |
| `notify-meeting-summary/index.ts` | Resolve org branding, fix hardcoded values |
| `coach-remind/index.ts` | Resolve org branding, fix fallbacks |
| `invite-to-schedule/index.ts` | Resolve org branding, fix fallbacks |
| `notify-eval-release/index.ts` | Add org sign-off |
| `admin-users/index.ts` | Fix `SITE_URL` fallback, add org sign-off to invite emails |
| `SchedulingInviteComposer.tsx` | Replace hardcoded URL with `window.location.origin` |
| `SetupPassword.tsx` | Replace "Alcan" copy with dynamic org name |
| `Welcome.tsx` | Replace "Alcan" copy with dynamic org name |
| `Layout.tsx` | Change alt text to "Pro-Moves" |

### What this does NOT include (future)

- Logo upload (storage bucket + org column)
- Accent color theming (CSS custom properties per org)
- Custom `from` email domains per org (requires per-org Resend verification)




# Add Logo Upload and Brand Color to Org Admin Setup Wizard

## What's happening now

The OrgSetupWizard Step 4 ("Branding") only has email-related fields (display name, sign-off, reply-to) and a placeholder saying "Logo upload and accent colors coming soon." Meanwhile, the Platform Console's OrgDetailPanel already supports logo upload to the `org-assets` storage bucket and brand color selection — but only superadmins can access that.

The OrgBootstrapDrawer (superadmin new-org creation) also has branding fields — but that's the wrong place for org admins to configure their own branding.

## Plan

### Single file change: `src/components/admin/setup/OrgSetupWizard.tsx`

**Add state variables** for logo and brand color:
- `logoFile`, `logoPreview` (File | null, string | null)
- `brandColor` (string, default `'#1a4a7a'`)
- `logoInputRef` (useRef)

**Update `loadData`** to also fetch `logo_url` and `brand_color` from the `organizations` query, and pre-populate the state (set `logoPreview` to existing `logo_url`, `brandColor` to existing `brand_color`).

**Update `saveBranding`** to:
1. If `logoFile` is set, upload to `org-assets/{orgId}/logo.{ext}` (same pattern as OrgDetailPanel)
2. Get public URL
3. Include `logo_url` and `brand_color` in the organizations update

**Update `renderStep4`** to replace the "coming soon" placeholder with:
- Logo upload section: preview of current logo (or upload button), file input, remove button — matching OrgDetailPanel's pattern
- Brand/accent color picker: a simple color input + hex text field
- Keep the existing email branding fields below

**Cleanup on unmount**: revoke any object URLs created for logo preview.

### No database changes needed
The `organizations` table already has `logo_url` and `brand_color` columns. The `org-assets` storage bucket already exists with appropriate policies.

### No OrgBootstrapDrawer changes
The branding section in the bootstrap drawer can remain as an optional "nice to have" during initial org creation by the superadmin. The org admin will configure it properly during their onboarding wizard.


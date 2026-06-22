# Feature Spec (DRAFT) — HR Offboarding Data Export

*Status: scoping. Owner input captured 2026-06-22. Related backlog item: NF6. Ties to GDPR /
data-retention (roadmap S1).*

## Purpose

When a staff member is **terminated and removed** from the platform, roll up everything we hold
about their development and send it to the HR contact for retention — **before** their data is
deleted. Produce it in **two forms**:
- **Raw data** (machine-readable: JSON and/or CSV) — complete record.
- **Polished summary** (human-readable: PDF/HTML) — so HR staff can skim it easily.

## What to include (current understanding)

A single person's full development record:
- **Evaluations** — `evaluations` + `evaluation_items` (scores, notes, summary feedback), and
  any **feedback provided to them** (released eval content, coach notes). *Open Q: include the
  audio recordings / transcripts, or just text?*
- **Pro Move submissions** — their `weekly_scores` (confidence + performance over time).
- **Profile basics** — name, role, location, hire date (and termination date).
- *(Open Q: doctor/coach baselines, reflections, quarter-focus selections — include?)*

## Output

- **Raw bundle:** JSON (and/or CSV per table) containing all of the above.
- **Polished report:** a readable PDF/HTML — header (who/role/location/dates), an evaluation
  summary, a Pro Move performance overview, and the feedback they received.

## Delivery (needs a decision — see safety note)

Options:
- **(Recommended) Generate a downloadable bundle** the admin reviews and forwards to HR manually.
  Safest: no automated external send of PII; the admin stays in control.
- Auto-email to a configured HR address — *higher risk*; emailing PII externally should be a
  deliberate, confirmed action with a fixed, trusted recipient, not free-form.

> **Safety / handling notes.** This feature exports **personal data** and is tied to **account
> deletion** — both sensitive. Build it so the **export is generated and confirmed first**, and
> deletion is a **separate, explicit step** after the export is secured. Deletion should be its own
> guarded action (no silent cascade). This also overlaps GDPR "right to erasure + retention"
> (roadmap S1) — worth designing the retention story once.

## Trigger & permissions

- Likely a distinct **"Offboard / Export"** action on a staff record (org-admin / super-admin
  only), separate from any existing delete path in the `admin-users` edge function.
- *Open Q: is this Alcan-internal HR (US) only for now, or should it be org-aware (each org's own
  HR contact) given the tenancy model?*

## Open questions (for owner)

1. **Audio/transcripts:** include evaluation audio + transcripts in the export, or text only?
2. **Scope of "everything":** beyond evaluations + feedback + Pro Move submissions — include
   baselines, reflections, quarter-focus? Where's the line?
3. **Delivery:** downloadable bundle the admin forwards (recommended), or automated email to a
   fixed HR address?
4. **Polished format:** PDF or HTML? Any required fields/branding HR expects?
5. **Deletion coupling:** should "export" and "delete" be one guided flow (export → confirm →
   delete) or fully separate actions?
6. **Tenancy:** Alcan-only for now, or per-org HR contact?
7. **Retention:** any required retention window / format from your HR side we should match?

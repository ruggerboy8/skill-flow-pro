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
  any **feedback provided to them** (released eval content, coach notes), including evaluation
  **transcripts** (not audio).
- **Pro Move submissions** — their `weekly_scores` (confidence + performance over time).
- **Profile basics** — name, role, location, hire date (and termination date).
- *(Open Q: doctor/coach baselines, reflections, quarter-focus selections — include?)*

## Output

- **Raw bundle:** JSON (and/or CSV per table) containing all of the above.
- **Polished report:** a readable PDF/HTML — header (who/role/location/dates), an evaluation
  summary, a Pro Move performance overview, and the feedback they received.

## Delivery  *(resolved)*

- Generate a downloadable bundle **and** allow the admin to **send it to HR directly from the
  ProMoves platform** — owner does NOT want to download, attach, and email manually. So the feature
  packages the export and sends it (e.g. via an edge function + email service) to the HR contact
  on an admin "Send to HR" action.
- Owner notes **no PII sensitivity concern** for this internal use, so we don't need the heavy
  PII-handling guardrails — but still treat send-to-HR as a deliberate, admin-triggered action.

> **Deletion coupling (resolved):** keep **export and delete as separate guarded steps** — export
> (and send) first, confirm it's secured, then delete as its own explicit action (no silent
> cascade). Still overlaps GDPR erasure/retention (roadmap S1).

## Trigger & permissions

- Likely a distinct **"Offboard / Export"** action on a staff record (org-admin / super-admin
  only), separate from any existing delete path in the `admin-users` edge function.
- *Open Q: is this Alcan-internal HR (US) only for now, or should it be org-aware (each org's own
  HR contact) given the tenancy model?*

## Resolved (2026-06-22)

- **Audio/transcripts:** include **transcripts**, not audio.
- **Delivery:** downloadable **and** sent to HR directly from the platform (admin action).
- **Deletion:** decoupled from export (separate guarded steps).
- **PII:** owner sees no special sensitivity for this internal use.

## Still open (revisit when we build this — it's feature #2)

1. **Scope of "everything":** beyond evaluations + feedback + Pro Move submissions — include
   baselines, reflections, quarter-focus? Where's the line?
2. **Polished format:** PDF or HTML? Any fields/branding HR expects?
3. **Tenancy:** Alcan-only for now, or per-org HR contact?
4. **Email mechanism:** which sending service (the project's existing email path, if any)?
5. **Retention:** any required window/format from HR to match?

# Feature Spec (DRAFT) — HR Offboarding Data Export

*Status: scoping. Owner input captured 2026-06-22. Related backlog item: NF6. Ties to GDPR /
data-retention (roadmap S1).*

## Purpose

When a staff member is **terminated and removed** from the platform, roll up everything we hold
about their development and send it to the HR contact for retention — **before** their data is
deleted. Produce it in **two forms**:
- **Raw data** (machine-readable: JSON and/or CSV) — complete record.
- **Polished summary** (human-readable: PDF/HTML) — so HR staff can skim it easily.

## What to include  *(resolved 2026-06-22)*

A single person's development record. **Default to over-reporting; pare back later.** Where a
section has no data, **say so explicitly** in the report (many people won't have all of this).

- **Evaluations** — `evaluations` + `evaluation_items`: the feedback they received, coach notes,
  and the **transcripts** (not audio).
- **Pro Move participation** — from `weekly_scores`, a **participation summary** (how consistently
  they engaged: weeks submitted, on-time vs late, completion over time). **Not** a dump of every
  confidence score.
- **Self-reported performance vs evaluation** — surface their **self-reported performance scores**
  alongside the matching **coach evaluation scores**, so HR can see self-assessment next to
  evaluated performance where both exist.
- **Profile basics** — name, role, location, hire date (and termination date).

## Output  *(resolved)*

- **A single PDF.** HR is non-technical and won't work with HTML/JSON or manipulate the data —
  it's for documentation. So the deliverable is **one readable PDF** (no raw JSON/CSV alongside).
- Structure: header (who / role / location / dates), an evaluations section (feedback +
  transcripts), a participation summary, a self-vs-evaluation comparison, each with a clear
  "no data on record" note when empty.

## Build approach  *(planned)*

- **PDF generated client-side** (no PDF tooling exists yet; add a lightweight lib such as
  `pdfmake`). The "Offboard / Export" action gathers the record via Supabase queries and renders
  the PDF for **download**.
- **Send to HR** posts the generated PDF to a new edge function that emails it as an attachment
  via **Resend** (already used by `coach-remind` / `notify-eval-release`) to a configured HR
  address. Deletion stays a separate, explicit step (existing `admin-users` delete path).

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

- **Scope:** evals + feedback + transcripts; pro-move **participation** summary (not all
  confidence scores); self-reported performance vs evaluation; acknowledge missing sections;
  default to over-reporting.
- **Format:** a single **PDF** (HR is non-technical; no HTML/JSON).
- **Delivery:** download **and** send-to-HR from the platform (admin action) via Resend.
- **Recipient:** one fixed HR email for v1 (configurable; per-org later).
- **Deletion:** decoupled from export (separate guarded steps).
- **PII:** owner sees no special sensitivity for this internal use.

## Still open

1. **HR email address** — the actual recipient (John to provide; wire as a config value meanwhile).
2. **Retention** — any required window/format from HR to match (none assumed for v1).

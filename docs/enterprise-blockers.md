# Enterprise Blockers

_Last updated: 2026-03-11_

This document tracks known issues that must be resolved before a broader
enterprise rollout — i.e., beyond Alcan-affiliated practices. Items are grouped
by domain and roughly priority-ordered within each group. Many of these are not
visible in the codebase; they are platform, legal, or operational decisions.

A full codebase audit (see §8) should be scheduled once the Phase 2 build is
stable, before onboarding any org that is not already Alcan-affiliated.

---

## 1. Infrastructure / Hosting

| # | Item | Notes |
|---|---|---|
| 1.1 | **Move off Lovable to own domain** | Current production URL is `alcanskills.lovable.app` — hardcoded in `notify-eval-release` email body and likely in auth redirect configs. Needs a custom domain (e.g. `app.skillflowpro.com`) before any non-Alcan org receives links. |
| 1.2 | **Supabase project isolation per tier** | Currently all orgs share a single Supabase project. For enterprise clients expecting data residency guarantees, per-project isolation may be required. At minimum, evaluate whether RLS alone is sufficient or whether tenant-per-project is needed. |
| 1.3 | **Production environment separation** | No staging environment currently exists. All development migrations run against the single live project. |

---

## 2. Email / Notifications

| # | Item | Notes |
|---|---|---|
| 2.1 | **Free Resend account → paid plan** | The free Resend tier has rate limits (100 emails/day) and no SLA. Any org with >20 staff receiving eval release notifications simultaneously will hit this. |
| 2.2 | **Org-neutral sender domain** | `notify-eval-release` currently defaults to `pro-moves@alcandentalcooperative.com` as sender and `johno@alcandentalcooperative.com` as reply-to. These are hardcoded fallbacks. The `RESEND_FROM` and `RESEND_REPLY_TO` env vars must be set to a neutral domain (e.g. `no-reply@skillflowpro.com`) before non-Alcan orgs receive emails. _Partially addressed in this session: the function now resolves org name dynamically, but the env vars still need updating._ |
| 2.3 | **Supabase Auth email templates** | Password reset, magic link, and invite emails use Supabase's default templates, which reference the project URL (`https://yeypngaufuualdfzcjpk.supabase.co`). These should be customized with branding and the correct app URL before non-Alcan orgs go live. |
| 2.4 | **Email deliverability (SPF/DKIM)** | No SPF/DKIM records confirmed for the sending domain. Emails to UK recipients (e.g., .co.uk addresses) are more likely to be flagged without proper DNS records. |

---

## 3. Legal / Compliance

| # | Item | Notes |
|---|---|---|
| 3.1 | **GDPR — Right to erasure** | No user data deletion or anonymization flow exists. Required before processing any UK/EU resident data. |
| 3.2 | **GDPR — Data export** | Users cannot request a download of their data (submissions, evaluations, scores). Required under GDPR Art. 20. |
| 3.3 | **GDPR — Data Processing Agreement (DPA)** | No DPA template or org-level acknowledgment captured. A DPA between Skill Flow Pro (as data processor) and each org (as data controller) is required before processing UK/EU employee data. |
| 3.4 | **UK ICO registration** | Organizations processing personal data of UK residents may need to register with the Information Commissioner's Office. Evaluate whether this applies to us as the platform operator. |
| 3.5 | **Terms of Service + Privacy Policy** | Platform-level ToS and Privacy Policy need to exist and be presented to org admins at onboarding. Currently no in-app acceptance flow exists. |

---

## 4. Data Isolation / Security

| # | Item | Notes |
|---|---|---|
| 4.1 | **Evaluation delivery tab showed all orgs' data** | _Fixed in this session._ `useEvalDeliveryProgress` now scopes location queries to the caller's org. |
| 4.2 | **RLS on evaluations/evaluation_items** | _Fixed in this session._ Policies now enforce org boundary via location→group→org chain. |
| 4.3 | **Release RPCs lacked org ownership check** | _Fixed in this session._ `release_single_evaluation` and `bulk_release_evaluations` now validate org membership before acting. |
| 4.4 | **Full security audit needed** | The fixes above were found opportunistically. A systematic audit of every RLS policy and edge function for org-boundary enforcement should be scheduled before enterprise scale. See §8. |

---

## 5. Multi-Tenant UX / Operations

| # | Item | Notes |
|---|---|---|
| 5.1 | **Eval results page — group dropdown scoped to caller's org** | _Fixed in this session._ FilterBar now scopes practice_group options to the caller's organization. |
| 5.2 | **Eval results page — default to location-detail for single-location orgs** | A small practice with one location should land directly on the location-detail view, not an org-snapshot view that requires them to select a group first. Add to future `EvalResultsV2` overhaul. |
| 5.3 | **EvalResultsV2 overhaul** | The eval results page is functional but designed around Alcan's multi-location structure. A future version should adapt its default view and navigation to org size (single vs. multi-location, single vs. multi-group). Low priority until a second non-affiliated org is active. |
| 5.4 | **notify-eval-release email body hardcodes app URL** | _Partially fixed in this session._ Org name is now dynamic. App URL still falls back to `https://skillflowpro.com` (generic placeholder); needs a real value once the platform has a permanent domain — see 1.1. |

---

## 6. Platform Monitoring & Operations

| # | Item | Notes |
|---|---|---|
| 6.1 | **No error monitoring** | No Sentry, LogRocket, or equivalent. Edge function failures are only visible in Supabase logs. Evaluate a lightweight error capture solution before enterprise rollout. |
| 6.2 | **No platform usage analytics** | No visibility into active orgs, DAU/WAU, eval completion rates, etc. at the platform level. The Platform Console shows org and user lists, but no aggregate health metrics. |
| 6.3 | **No alerting on edge function failures** | `coach-remind`, `notify-eval-release`, `sequencer-rank` etc. can fail silently. No alerting mechanism (PagerDuty, email, Slack) configured. |
| 6.4 | **Sequencer health is opt-in** | `sequencer-health` edge function exists but its invocation cadence and alerting behavior are unclear. Confirm it is scheduled and that failures surface somewhere actionable. |

---

## 7. AI Content Pipeline

| # | Item | Notes |
|---|---|---|
| 7.1 | **AI prompts may contain Alcan-specific context** | `extract-insights`, `format-transcript`, and `format-reflection` edge functions have not been audited for Alcan-specific prompt framing (e.g., "pediatric dental", "ALCAN"). These prompts would produce incorrect output for a UK general dental practice. |
| 7.2 | **No org-specific AI prompt configuration** | There is no mechanism for an org to customize how AI insights are framed for their practice context (e.g., pediatric vs. general). A prompt template system scoped per `practice_type` would be needed for quality output across org types. |

---

## 8. Full Project Audit (Scheduled)

Before onboarding any org that is not Alcan-affiliated, a complete audit should
verify:

- [ ] Every page and hook that loads a list of items (staff, evaluations, assignments, etc.) enforces org scope — either via RLS or explicit `organizationId` filtering
- [ ] Every edge function that sends data to users (email, notifications) uses org-resolved sender info, not hardcoded Alcan addresses
- [ ] Every RLS policy on tables with org-level data uses `current_user_org_id()` correctly
- [ ] Sequencer functions (`sequencer-rank`, `sequencer-rollover`) are org-scoped — unclear whether they respect org boundaries on pro move sequencing
- [ ] The audio pipeline (`generate-audio`, `save-audio`, `transcribe-audio`) is org-safe — do audio files in storage have org-scoped access paths?
- [ ] Coach remind emails use org-resolved sender info
- [ ] Supabase Auth email templates are customized and reference the correct app URL
- [ ] All hardcoded references to `alcan`, `pediatric`, or `johno` are found and made configurable

---

## Out of Scope (Phase 1)

These were deliberately deferred and are documented in the rollout plan:

- Bulk user import (email invite is the primary path)
- Mixed practice types within one org
- Self-service org onboarding (currently manual via platform admin)
- Location-level assignment scope (builder writes at org level)
- Group-level admin

# Feature Spec — Evaluation Overhaul

*Status: planning. Owner decisions resolved 2026-06-23 (John).*
*Backlog: E1, EX1–EX4. Source map: [`docs/audits/evaluation-flow-analysis.md`](../audits/evaluation-flow-analysis.md).*
*Build order (owner-set): **evaluator → staff → delivery**.*

> This is a build plan layered on top of the read-only analysis. Where it cites `file:line`, that
> file is the source of truth. Verify column existence against migrations before writing any
> migration.
>
> **Ground rule (owner):** nothing on the evaluator-facing side is assumed to survive. Every
> element, including the transcription approach, is on the table for rebuild or replacement. The
> existing implementation was an early Lovable build; where there is a cleaner or better approach,
> we take it. The competency-as-storage-unit decision (Option A) holds, but the UI on top of it is
> greenfield.

---

## 0. North star

The evaluator records observations once, with real guidance, and the system turns that into a
complete, warm, score-backed evaluation that lands as something genuinely good for the staff
member. Central office controls when it lands.

**The defining constraint (owner insight):** our evaluators know their staff and their habits, but
they are *not* fluent in the competency framework, and they do not carry the granularity of the
Pro Move scoring expectations in their heads. So the capture cannot just ask "talk about this
person." It has to **teach the framework as it collects**, showing the evaluator what each domain
covers (via its competencies and Pro Moves) so their observations land in the right place and at
the right level of detail.

That reframes EX1 from "remove cognitive load" to "scaffold *and* educate at the point of capture."

---

## 1. Owner decisions (locked)

| # | Decision | Consequence |
|---|---|---|
| Storage unit | **Option A: competency stays the storage unit; Pro Move is the lens.** | No schema change to storage grain. |
| Capture model | **Per-domain guided process** (see §2.1). Walk the evaluator through one domain at a time. | Replaces the flat competency grid and the tap-tagging interaction entirely. |
| Scoring | **Manual 1–4 per competency, clicked by the evaluator.** Owner wants the deliberate act of choosing each number. | No AI score suggestion. Partial scoring (≈12 of 16) is expected and fine; see §3.1. |
| Release policy | **Admin-only separate release.** Submit stays gated. | Tighten RPC auth to org-admin/super-admin (analysis finding #5); kill auto-release ambiguity (#4). |
| Baseline | **Remove coach `type='Baseline'` from the software.** First eval is colloquially "the baseline" but not a tracked type. **Doctor baseline stays.** | Drop the Baseline branch in eval creation/UI; deletes the duplicate-Baseline uniqueness gap (#6) by removing the case. |
| Permissions | **Align release/eval auth onto `user_capabilities`** (backlog B2), preserving everyone who legitimately holds it today. | Migrate off the legacy `is_coach/is_org_admin` flags for these paths. |
| Capture input | **Voice and text equally weighted.** Text gets a "Polish / Magic" button that coachifies the language. | Both paths first-class; the polish step replaces the implicit "format-transcript" cleanup for typed input. |
| Transcription | **Reconsider the whole approach.** The current Whisper + ElevenLabs fallback feels janky. Explore better browser-side options. | Research spike in §2.2 before committing. |

---

## 2. Phase 1 — Evaluator (EX1 + EX2)

The capture experience, rebuilt. This is where the felt pain lives and where the biggest win is.

### 2.1 Per-domain guided capture (the new core)

Instead of one flat grid of 126 competency rows, the evaluator moves through the **four domains**
one at a time (Clinical, Clerical, Cultural, Case Acceptance). For each domain:

1. **Show the domain's scope.** Display that domain's competencies, with the underlying Pro Moves
   shown as **titles only** (no click-through to learning materials). On hover, reveal the Pro
   Move's description / "why this is important" language. This is the teaching step: it grounds an
   evaluator who knows the person but not the framework, without burying them in detail.
2. **Prompt with domain-specific sentence stems / open-ended questions.** The stems pull out what
   is going well and what they want improved *within that domain* ("In the operatory, what did you
   see them do well clinically?", "Where did their clinical technique fall short of what you'd
   want?"). Exact wording is owner-authored during build (§5 open item).
3. **Capture by voice or text.** Voice records a short, single-take clip for that domain; text is
   typed directly and gets a Polish / Magic button that formalizes and coachifies the wording.
4. **AI slots the response under the right competencies in that domain** and returns, at minimum,
   **recommended Glow and Grow language** the evaluator can accept or edit. Slotting into the
   correct competency is what makes clean delivery to staff possible.
5. **The evaluator clicks the 1–4 score for each competency** they want to score, **inline within
   the domain** (scoring placement is per-domain, owner decision). The deliberate act of choosing
   the number stays.

Candidate happy-path flow for a single domain:

> 1. Record (or type) your brain-dump on this person's *clinical* skills as you saw them.
> 2. Feedback gets slotted under the proper clinical competency, with suggested Glow/Grow wording.
> 3. You set the ratings for that domain.

**Navigation must be fluid, not a locked linear wizard.** Some evaluators will finish one domain
completely before moving on; others will jump around getting all their thoughts down first and
score later. The evaluator must be able to move freely back and forth between domains at any point,
with per-domain progress (captured / slotted / scored) visible so nothing gets lost.

### 2.2 Transcription / recording (EX2) — reconsider, do not just patch

The current pipeline (client webm → edge function → Whisper ≤25MB with an ElevenLabs Scribe
fallback, plus <3KB silence guards and segment concatenation) is fragile: pause/resume produces
webm that Whisper rejects, and concatenation is brittle (analysis finding #3). Owner reads this as
janky and wants a genuinely better approach explored, not a patched state machine.

**Spike before committing.** Evaluate, in rough order of promise:

- **Short single-take clips per domain prompt.** The per-domain structure naturally produces
  several short recordings instead of one long paused session, which sidesteps most of the
  pause/resume and concatenation fragility regardless of provider. This alone may remove the need
  for the fallback machinery.
- **Streaming transcription** (e.g. a realtime speech provider) for a live transcript as they
  speak, which also gives immediate feedback that capture is working.
- **Keep the resilient bits that earned their place:** the silent-clip guard and 200-with-error
  responses so the client sees real messages.

Deliverable from the spike: a short recommendation (one provider/approach, with the tradeoff)
before the recorder is rebuilt. Extract recording state out of the ~1,900-line `EvaluationHub`
god-component as part of this work regardless of which provider wins.

### 2.3 Post-record review

Agreed. After capture + slotting, one screen: "Here is what I heard, slotted into these
competencies. Edit the wording, set or adjust scores." This consolidates the current two-tab +
recording-machine into a single coherent surface.

- **Post-record Pro Move flagging: TBD / likely optional.** Owner is unsure it earns its keep; it
  may be too much. Treat as a nice-to-have we can prototype and cut, not a Phase 1 requirement.

### 2.4 Legacy cleanup (owner approved)

Delete to stop dead paths from shaping the work:

- Orphaned `ObservationRecorder.tsx` / `InterviewRecorder.tsx` (imported nowhere). **Approved.**
- `audio_recording_path` upload UI and `interview_transcript` self-assessment remnants
  (`isLegacyInterviewEval`, `src/lib/evaluations.ts:48`).
- Retire `extracted_insights` (batch-only writer; staff wizard reads `review_payload`).
- Remove the coach Baseline branch (see §4.3).

---

## 3. Phase 2 — Staff delivery (EX4)

Make what the staff member receives joyful, positive, and complete. The 8-step staff wizard
(`src/pages/EvaluationReview.tsx`) is already the most polished surface, so this is about
completeness, cohesion, and an evaluator-facing pre-submit review, not a rebuild.

### 3.1 Completeness, reframed by owner

The "sparse below 4 scored competencies" rule is the wrong worry. Owner's reality:

- Of ~16 competencies per position, **at least ~12 get scored**, and that is fine.
- The unscored ones are typically the **contextual / not-always-observed** competencies (conflict
  resolution, complaint handling). Not scoring them is correct behavior, not a gap.

So: **drop the hard count-of-4 sparse gate.** Do not treat unscored contextual competencies as a
defect.

### 3.2 Glow / Grow as a per-domain preference

- Not a hard requirement that every eval has one strength and one growth overall.
- **Preferred shape: a Glow and a Grow per domain where possible.** Encourage it, do not enforce
  it. The per-domain capture (§2.1) makes this natural since the evaluator speaks to each domain.

### 3.3 Evaluator-facing pre-submit review (new scope)

Owner agrees a "this will look thin" nudge helps, and goes further: the current flow (a Summary
tab with no real evaluator review of the eval before submit) needs attention as a whole.

- Build a **cohesive pre-submit review for the evaluator**: a single readout of the whole
  evaluation as the staff member will experience it, so the evaluator can assess overall quality
  and coverage before submitting.
- Surface gentle, non-blocking signals there (e.g. "Clinical has no Grow yet", "this section will
  read thin"), without hard-blocking submit.

---

## 4. Phase 3 — Delivery / release (EX3)

Lands last. Independent of the capture rewrite, so Lovable could take parts in parallel.

### 4.1 Release policy — admin-only separate release (owner: looks good)

- **Restrict release to org admins** (and super admins). Today any `is_coach` can release
  (`20260313150029:120,:161`).
- **No auto-release.** Submit only flips `status='submitted'`; document the rule as a short ADR so
  the `20260421203850` "matches new submit behavior" contradiction cannot creep back. Update the
  submit toast to "your central office will deliver this."
- Authorize via **`user_capabilities`**, not the legacy flags (the permissions-alignment decision),
  preserving current legitimate holders.

### 4.2 Delivery UI + a spot-check routing fix

- The `DeliveryTab.tsx` three-column grid needs UI work; today it is not very useful.
- **Routing gap to fix:** from the delivery page, a **super admin (mostly John) must be able to
  click into an evaluation and see how well it was done before releasing it.** Owner wants to spot
  check quality pre-release. Add that drill-in route from Delivery to a read view of the full eval.
- Since release is admin-only, remove release controls from coach-facing surfaces.

### 4.3 Remove coach Baseline (owner: remove it)

- Drop `type='Baseline'` for coach evals from the software. The first eval for a newly onboarded
  practice is colloquially the baseline, but that is an internal operating policy, not a tracked
  software type.
- **Doctor baseline stays** (unaffected).
- Removing the Baseline case also removes the NULL-quarter duplicate-uniqueness gap (#6) by
  eliminating the branch that created it. Verify no code path hard-depends on `type='Baseline'`
  before removing; migrate or archive any existing Baseline rows deliberately.

---

## 5. Sequencing and open items

**Sequence:** Phase 1 (capture rebuild) → Phase 2 (completeness + evaluator pre-submit review) →
Phase 3 (release + delivery UI). Cleanup (§2.4) and the transcription spike (§2.2) happen early in
Phase 1. The release/UI work in Phase 3 can run in parallel since it does not touch capture.

**Resolved open questions:**
- Voice vs text default: **equal weight**; text gets a Polish / Magic coachifying button.
- Orphaned recorder deletion: **approved.**
- Baseline: **remove coach baseline, keep doctor baseline.**
- Permission model: **align to `user_capabilities`, preserve current holders.**
- Scoring placement: **per-domain, inline**, with fluid back-and-forth navigation between domains.
- Pro Move teaching depth: **titles only**, description / "why this matters" on hover, no
  click-through to learning materials.

**Still open, to settle during build:**
1. **Prompt wording** for the per-domain sentence stems (owner-authored, during §2.1).
2. **Transcription approach** — output of the §2.2 spike (single-take clips vs streaming provider).
3. **Post-record Pro Move flagging** — prototype and decide if it earns its place (§2.3).

---

## 6. Key files

- Authoring: `src/pages/coach/EvaluationHub.tsx`, `src/lib/evaluations.ts`,
  `src/components/coach/RecordingStartCard.tsx`, `SummaryTab.tsx`, `ProMovesAccordion.tsx`,
  `FloatingRecorderPill.tsx`, `src/hooks/useAudioRecording.tsx`, `src/lib/audioChunking.ts`.
- AI pipeline: `supabase/functions/{transcribe-audio,format-transcript,map-observation-notes,format-evaluator-note,notify-eval-release}/index.ts`.
- Delivery: `src/components/admin/eval-results-v2/DeliveryTab.tsx`, `src/hooks/useEvalDeliveryProgress.tsx`.
- Staff review: `src/pages/EvaluationReview.tsx`, `src/lib/reviewPayload.ts`,
  `src/components/review/CompetencyCard.tsx`.
- Schema/RPCs: `20250820222724` (origin), `20260128144756` (`is_visible_to_staff`),
  `20260211170312` (delivery cols + RPCs + focus), `20260211180832` (review_payload v2),
  `20260313150029` (org-scoped RLS + release RPCs).

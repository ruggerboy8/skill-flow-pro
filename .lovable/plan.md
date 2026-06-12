# Clinical Director Coaching Flow — Clarity & Layout Pass

Six grouped changes, in priority order. I'll ship in three commits matching the priority tiers so each can be reviewed.

## 1. One status vocabulary per session  *(highest)*

**`src/lib/coachingSessionStatus.ts`** — add a `nextAction` (short verb phrase) and `pillLabel` alongside the existing `label`, so it can serve as the single source of truth for both the badge and the journey pill. The status table becomes:

| status | label / pill | nextAction (CD) |
|---|---|---|
| scheduled | Draft | Build agenda |
| director_prep_ready | Agenda Ready | Send to doctor |
| scheduling_invite_sent | Invite Sent | Awaiting doctor's response |
| doctor_prep_submitted | Doctor Prepped | Ready for meeting |
| meeting_pending | Summary Shared | Doctor can review the summary |
| doctor_confirmed | Completed | Schedule next session |
| doctor_revision_requested | Doctor Left a Note | Review the doctor's note |

**`src/lib/doctorStatus.ts`** — for every session-derived branch, return the exact `label` and `nextAction` from `SESSION_STATUS_CONFIG` (no parallel strings). Keep the non-session branches (`invited`, `baseline_in_progress`, `baseline_submitted`, `ready_for_prep`) as-is since they don't come from a session.

**`DoctorDetailThread.tsx` SessionCard** — remove the `'Draft — build agenda…'` / `'Send invite to schedule'` / `'Awaiting scheduling'` ternary (lines 385-391). The header keeps the badge + the meeting date (`Met on …` when applicable). Subtitle stays only for *information* not status: `Awaiting doctor's response`, `N action steps`, `Doctor left a note`.

**`DoctorManagement.tsx` table** — drop the prose `Next Step` column entirely. Keep `Name | Location | Stage | Action | ⋯`. The action button label comes from `journeyStatus.nextAction` (or a sensible verb per stage), so "where is this" lives in the pill and "what do I do" lives on the button — one phrasing each.

## 2. Drop the hidden coach-baseline gate  *(highest)*

**`DoctorDetailThread.tsx:164`** — change the add-session guard from
`(sessions.length > 0 || coachAssessment?.status === 'completed')`
to
`(sessions.length > 0 || doctorBaselineComplete)`.

The dashed "Start/Continue Coach Baseline Assessment" CTA above it (lines 152-161) stays — it's now an optional nudge. The existing soft `nudge` in `doctorStatus.ts` ("Tip: Complete your private baseline…") already covers the encouragement. Nothing downstream reads `coachAssessment.status === 'completed'` as a gate after this change.

## 3. Collapse "publish" and "send invite" into one motion  *(highest)*

**`DirectorPrepComposer.tsx`** — rework the bottom action row (lines 875-895) and the `published` success view (lines 501-534):

- Primary button becomes **"Send to doctor"**. On click: run the existing `publishMutation` (writes selections + sets status to `director_prep_ready`), then **immediately open `SchedulingInviteComposer`** with the default template pre-filled (it already does this via `loadTemplate`).
- When the invite composer's `onSuccess` fires (status becomes `scheduling_invite_sent`), the composer closes and we render the existing success card with copy "Prep published & invite sent."
- If the CD dismisses the invite dialog without sending, we still leave the session at `director_prep_ready` (no regression vs today) but show a small inline "Invite not yet sent — Send Invite" button on the success card so the recovery path is one click, not a navigation.
- Secondary **"Save draft"** stays for the not-ready case (no status change, no invite dialog).
- "Edit Agenda" on the SessionCard stays available so revisions remain possible.

No DB / RLS changes; pure UI re-flow on top of the existing two mutations.

## 4. Terminology pass + follow-up bug

a) Agenda verb — replace `Build Prep` (`DoctorManagement.tsx` `InlineAction`), `Ready for Doctor` (`DirectorPrepComposer.tsx:890`), and any "Discussion Topics" header copy in the composer with **"Build agenda"** / **"Send to doctor"** / **"Meeting agenda"** consistently.

b) **`DoctorDetailThread.tsx:461`** — rename `Start Meeting` to **"Log meeting"** (icon stays `ClipboardEdit`). Same rename in `DoctorManagement.tsx` `InlineAction` for `stage === 'meeting_ready'`.

c) Private-baseline naming — use **"Private baseline (your view)"** in `DoctorDetailThread.tsx` CTA and `DoctorDetailBaseline.tsx` card title. The thread CTA goes away entirely after item 5b, so practically only `DoctorDetailBaseline.tsx` needs the rename.

d) **`src/lib/doctorStatus.ts:57`** — change `latest.session_type === 'followup'` to `=== 'follow_up'`. Single-character fix that unblocks the `followup_completed` stage and the "Schedule next follow-up when ready" copy.

## 5. Reorder doctor detail page + single home for private baseline

**`src/pages/clinical/DoctorDetail.tsx`** — render in this order:

1. Header (name + pill + one next-action line from `journeyStatus.nextAction`).
2. `DoctorDetailOverview` (release-baseline card, only when `stage === 'invited'` *and* `!baseline_released_at` — tighten the condition so it never appears after release).
3. `<Collapsible>` **Doctor's baseline results** (`ClinicalBaselineResults`) — promoted above the thread. `defaultOpen={baseline?.status === 'completed'}`.
4. **Coaching Thread** (`DoctorDetailThread`).
5. `<Collapsible>` **Private baseline** with `DoctorDetailBaseline`.

**`DoctorDetailThread.tsx`** — delete the dashed Coach Baseline CTA block (lines 151-161). The single entry point is now the status-bearing card in `DoctorDetailBaseline.tsx`, which already shows Not Started / In Progress / Complete and last-updated.

## 6. Atomic RPC for coach-baseline resume  *(high)*

The migration referenced in the brief (`20260612180000_coach_baseline_resume_fix.sql`) doesn't exist in the repo. I'll create it as part of this commit.

**Migration** (`supabase/migrations/20260612180000_coach_baseline_resume_fix.sql`):

- Add `UNIQUE (doctor_staff_id)` to `public.coach_baseline_assessments` if not already present. *Backfill check:* if any doctor has multiple rows today, keep the earliest-created one and delete the rest (no data is destroyed — items hang off `assessment_id`, and the earliest is the canonical owner per existing "first-to-start" rule). I'll inspect counts in the same migration with a `DO $$` guard and abort if conflicts can't be resolved cleanly.
- Create `public.get_or_create_coach_baseline_assessment(_doctor_staff_id uuid)` as `SECURITY DEFINER`, returning `(id uuid, status text)`. Body: `SELECT` the existing row; if none, `INSERT` with `coach_staff_id = (SELECT id FROM staff WHERE user_id = auth.uid())` and `status = 'in_progress'`, returning the new row. Wrapped so concurrent calls can't double-insert (the unique constraint is the backstop). `GRANT EXECUTE … TO authenticated`.

**Frontend** (`src/components/clinical/CoachBaselineWizard.tsx`):

a) Delete `createMutation` (the insert) and the auto-create `useEffect` (lines 460-472).
b) Replace with a one-shot RPC call gated on `staff?.id && existingAssessment === null && !assessmentId`:

```ts
const { data, error } = await supabase
  .rpc('get_or_create_coach_baseline_assessment', { _doctor_staff_id: doctorStaffId });
if (data) { setAssessmentId(data.id); if (data.status === 'completed') setIsComplete(true); }
```

c) After the RPC call and on `completeMutation` success, invalidate `['coach-baseline-assessment', doctorStaffId]` so `DoctorDetail`'s status card flips from "Start" to "Continue/View" immediately.

`DoctorDetail.tsx`'s query is unchanged.

---

## Ship order

1. Commit A — items 1, 2, 3 (text/logic-only frontend changes).
2. Commit B — item 6 migration + wiring + item 4d (the one-character bug).
3. Commit C — items 4a–c (terminology) + item 5 (page reorder & single CTA).

## Out of scope (confirming)

- Doctor-facing screens (`DoctorReviewPrep`, `BaselineWizard`) — untouched.
- No changes to the prep composer's selection logic, prior-action capture, or AI formatting.
- No changes to RLS on `coaching_sessions` or `coach_baseline_items`.

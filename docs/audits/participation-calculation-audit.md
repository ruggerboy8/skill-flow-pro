# Coach Participation Calculations — Audit

*Date: 2026-06-24. Scope: READ-ONLY analysis of how the coach panel computes per-week completion
state and the 6-week participation rate, what the intended behavior should be, and where the
current implementation diverges. Triggered by an Avenue Dental staff row showing confidence and
performance "complete" while the participation rate read 67%.*

> Map, not a fix. `file:line` and migration names are the source of truth. The fix belongs on its
> own branch; this doc is the input to that work.

---

## 0. TL;DR

The coach table surfaces **two numbers that are computed by two completely independent pipelines
that do not share a definition of "completed this week."** That is the root cause. They diverge on
self-select, on excuses, and on how a week is counted, so they can visibly contradict each other.

On top of that, the rate pipeline has a **time-gating gap**: a newly onboarded staff member is
charged for a metric window whose deadline had already closed before they started. That is what
drags a brand-new practice's rate to something like 67% while the week the coach is looking at
shows complete.

**Recommendation:** unify both surfaces onto one authoritative per-week-per-metric completion
definition, and gate first-week windows on the actual per-metric deadline versus the staff
member's participation start.

---

## 1. What the module is for (intended operation)

A coach glancing at the table needs two genuinely different things:

1. **Current completion state** — "has this person done this week's confidence / performance yet?"
   This must be deadline-aware: before the deadline an un-submitted metric is *pending*, after it is
   *missing*.
2. **Trailing 6-week participation rate** — "of what they actually owed over the last 6 weeks, what
   share did they turn in?"

Intended invariants:

- **One definition of "done" for week W**, shared by the per-week display and the rate. A coach
  should never see a row marked complete that the rate simultaneously treats as a miss.
- **The denominator only includes windows the person could actually have submitted.** A new hire is
  not charged for a deadline that closed before they onboarded.
- **Self-select, excuses, and partial weeks are handled identically** in both places.

---

## 2. How it actually works — two independent pipelines

### 2.1 Per-week display ("complete" pills)

- Source: `get_staff_all_weekly_scores` RPC, grouped client-side in
  [`useStaffAllWeeklyScores`](../../src/hooks/useStaffAllWeeklyScores.tsx).
- A week's `is_complete` = `assignment_count > 0 AND conf_count === assignment_count AND
  perf_count === assignment_count AND !has_any_late`
  ([useStaffAllWeeklyScores.tsx:121](../../src/hooks/useStaffAllWeeklyScores.tsx)). So "done" means
  **every** assignment scored.
- Counts **all** assignments, including self-select.
- The hook itself does **no excuse handling**; `StaffDetailV2` applies `isExcused` separately at the
  component level, and wraps the current week with `getDeadlineAwareStatus`.

### 2.2 Participation rate ("67%")

- Source: `view_staff_submission_windows` (migration `20260204222301`) →
  `get_staff_submission_windows` function (migration `20260126172223`, excuse filters) →
  [`calculateSubmissionStats`](../../src/lib/submissionRateCalc.ts), batched in
  [`useStaffSubmissionRates`](../../src/hooks/useStaffSubmissionRates.tsx) over a trailing 42 days.
- One "expected" per metric per week if any **required** action exists; "completed" if any required
  action of that metric is submitted ([submissionRateCalc.ts:88](../../src/lib/submissionRateCalc.ts)).
- A window is countable only if `due_at <= now OR status === 'submitted'`
  ([submissionRateCalc.ts:41](../../src/lib/submissionRateCalc.ts)), so a not-yet-due performance
  window is excluded from the denominator unless submitted early.
- Excludes self-select (`WHERE required = true` in the view).
- Honors excuses (week-level, per-submission, and location-level) in SQL.
- Returns `null` (not 0% or 100%) when there are no countable windows, to avoid misleading values.

### 2.3 Where they diverge

| Dimension | Display ("complete") | Rate ("67%") | Effect |
|---|---|---|---|
| Self-select | counted | excluded (`required = true`) | A week of only self-select reads complete but is invisible to the rate. |
| "Done" granularity | **all** assignments scored | **any** required action of the metric submitted | A partially-scored week reads incomplete on the row but counts as done in the rate. *(Low real-world risk — see note below.)* |
| Excuses | hook ignores; component patches | honored in SQL | Excused weeks can be treated inconsistently between the two surfaces. |
| Deadline | client-side, current week only | due-aware in SQL for all weeks | Different notions of pending vs missing across the two views. |

**Note on the "any vs all" divergence:** per owner, there is effectively no path for a real partial
submission. A staff member scores all of a week's pro moves together in the wizard; the only way to
land partial is to exit mid-rating, which is very rare. So this divergence is mostly theoretical and
**not** the cause of the reported symptom. It is documented for completeness, not prioritized.

---

## 3. The Avenue Dental 67% — root cause

The rate-understatement is a **time-gating gap in window generation**. In
`view_staff_submission_windows`, the `staff_weeks` CTE includes a staff member for a week when:

```sql
COALESCE(bs.participation_start_at::date, bs.hire_date) <= (aw.week_start_date + INTERVAL '6 days')::date
```

That only checks the person started before the week **ended** (Sunday). But the metric deadlines are
mid-week:

- Confidence `due_at` = `week_of + 1 day + 12 hours` (Tuesday noon, location tz).
- Performance `due_at` = `week_of + 6 days + 12 hours` (Saturday noon, location tz).

So a new hire who onboards mid-week (e.g. Thursday) is still given that week's **confidence** window,
whose deadline (Tuesday noon) had **already passed before they existed in the system**. With no
score and `now > due_at`, the view stamps it `missing`, and it is countable, so it lands in the
denominator as an expected-but-missed window.

Worked example matching the symptom:

- Week A (a full week they were present for): confidence submitted, performance submitted → 2 of 2.
  This is the row the coach sees marked complete / complete.
- Week B (their partial first week): confidence window present, deadline already closed at onboard,
  never submittable → counted as 1 expected, 0 completed.
- Total: 2 completed / 3 expected = **67%**.

New staff are exactly the population whose `participation_start_at` lands mid-week, which is why this
surfaces on the newest practice. Performance can hit the same trap for someone onboarding after
Saturday noon of their first week.

---

## 4. Findings (ranked)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 1 | High | **Two independent completion definitions.** Display and rate are computed by separate pipelines with different rules, so they can contradict each other for the same week. This is the core of the "complete but 67%" confusion. | §2.1 vs §2.2 |
| 2 | High | **First-week windows are not gated on per-metric deadline vs participation start.** New hires are charged for deadlines that closed before they onboarded, understating brand-new staff/practice rates. | `view_staff_submission_windows` `staff_weeks` CTE (`20260204222301`); due_at computed later in `conf_data`/`perf_data`. |
| 3 | Med | **Self-select handled inconsistently.** Display counts it; rate excludes it. | view `WHERE required = true` vs `useStaffAllWeeklyScores` counting all assignments. |
| 4 | Med | **Excuse handling is split.** Rate honors week/submission/location excuses in SQL; the display hook ignores excuses and relies on the component to patch per-cell. | `get_staff_submission_windows` (`20260126172223`) vs `useStaffAllWeeklyScores.tsx`. |
| 5 | Low | **"Any vs all" within a metric.** Rate counts a metric done if any required action is submitted; display requires all. Real-world risk is low (no normal partial-submission path; only exiting the wizard mid-rating). | [submissionRateCalc.ts:88](../../src/lib/submissionRateCalc.ts) vs [useStaffAllWeeklyScores.tsx:121](../../src/hooks/useStaffAllWeeklyScores.tsx) |

---

## 5. Direction for the fix (separate branch)

1. **Single source of truth.** Make the per-week display read from the same window definition the
   rate uses (or vice versa), so "complete" and the rate denominator agree by construction. The
   view-based windows are the more carefully built of the two (deadline-aware, excuse-aware,
   required-only) and are the better candidate to become canonical.
2. **Gate first-week windows on the actual deadline.** A metric window should only be expected when
   `due_at >= participation_start_at` (i.e. the deadline had not already passed when the person
   started). This removes the phantom-missing first-week windows behind finding #2.
3. **Pick one self-select policy** and apply it to both surfaces. "Required-only" is defensible for a
   participation *rate*; if so, the display completeness should match it.
4. **Honor excuses in one place** so both surfaces inherit them.
5. Leave the "any vs all" divergence (#5) as-is unless the canonical definition resolves it for free,
   since the real-world risk is negligible.

**Suggested verification before/after the fix:** query `get_staff_submission_windows` for the
Avenue Dental staff member and confirm the phantom first-week `missing` window disappears once #2
lands, and that the rate matches the per-week display.

---

## 6. Key files

- Display: [`src/hooks/useStaffAllWeeklyScores.tsx`](../../src/hooks/useStaffAllWeeklyScores.tsx),
  `src/pages/coach/StaffDetailV2.tsx` (`getDeadlineAwareStatus`, `StatusPill`),
  `get_staff_all_weekly_scores` RPC.
- Rate: [`src/lib/submissionRateCalc.ts`](../../src/lib/submissionRateCalc.ts),
  [`src/hooks/useStaffSubmissionRates.tsx`](../../src/hooks/useStaffSubmissionRates.tsx),
  `view_staff_submission_windows` (`20260204222301`),
  `get_staff_submission_windows` (`20260126172223`).
- Excuses: `excused_weeks`, `excused_submissions`, `excused_locations` (`20260126172223`).

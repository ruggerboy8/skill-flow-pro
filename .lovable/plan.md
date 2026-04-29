## Context

You already have everything needed to track reminders — `reminder_log` records every send (`target_user_id`, `type`, `sent_at`, `sender_user_id`, `subject`, `body`). The gap is that the Reminders tab doesn't *read* from it, so when Ariyana sends RDA nudges and the coach sends nudges for everyone else, neither knows what the other already did.

The fix is purely UI + a small query — no new tables.

## Recommendation

Turn each "Missing X" card from a single bulk-send button into a **per-staff list** that shows reminder status for the current week, and lets the manager pick exactly who to (re-)remind.

### What each row shows

For every staff member missing the metric this week:

```text
☐  Briana Lopez (RDA)               Not yet reminded
☑  Mary Payne (RDA)                 Reminded Tue 9:14am by Ariyana
☐  Wes Johnson (Hygiene)            Reminded Tue 9:14am by Ariyana · 2 days ago
                                    [Remind again]
```

- **Checkbox** to include/exclude in the next batch
- **Status pill**: "Not yet reminded" / "Reminded {relative time} by {sender first name}"
- **"Remind again" affordance** when last reminder is >24h old (or always available, just visually de-emphasized if recent)
- Default selection: anyone NOT reminded this week is pre-checked; anyone reminded in the last 24h is unchecked (so the obvious "send to everyone" path doesn't spam).

### Card header summary

```text
Missing Performance Scores — Week of Apr 27
8 missing · 5 already reminded · 3 not yet contacted
[Select all not-yet-reminded]  [Select all]  [Clear]
```

This gives Ariyana an at-a-glance answer to "did anyone already nudge these people?"

### Send confirmation

The existing preview modal stays, but the recipient list reflects the checkboxes. After send, the rows refresh to show the new "Reminded just now by you" status.

## Why not a separate tracking table or a "sent" flag?

`reminder_log` already *is* the source of truth — it's append-only, scoped by `sent_at`, and queryable by `(target_user_id, type, week)`. Adding a flag elsewhere would duplicate state and drift. The only thing missing is reading it.

## Technical changes

### 1. Query reminder history alongside staff data
In `src/pages/coach/RemindersTab.tsx`, after building `needConfidence` / `needPerformance`, fetch reminder_log entries for the current week's Monday→now window:

```ts
const { data: logRows } = await supabase
  .from('reminder_log')
  .select('target_user_id, type, sent_at, sender_user_id')
  .in('target_user_id', allTargetUserIds)
  .in('type', ['confidence','performance'])
  .gte('sent_at', earliestMondayUtc.toISOString())
  .order('sent_at', { ascending: false });
```

Build a map `Map<user_id|type, { sent_at, sender_user_id }[]>` keyed to the most recent entry per (target, type).

### 2. Resolve sender names
Collect distinct `sender_user_id`s from the log rows, fetch `staff.name` for each, cache in a `Map<user_id, string>`. Falls back to "a manager" if not found.

### 3. New row-level UI in each card
Replace the single "Preview & Send (N)" button with a list:
- Checkbox + name + role + status pill
- Status pill uses `formatDistanceToNow(sent_at)` from date-fns
- Header controls: "Select not-yet-reminded" / "Select all" / "Clear"
- Footer: "Send to N selected" button opens the existing modal pre-populated with the checked recipients

### 4. Refresh after send
After `coach-remind` succeeds, re-run `loadStaffData()` so the rows reflect the new log entries immediately.

### 5. RLS check
`reminder_log` already has `Coaches can read reminder logs` policy using `is_coach_or_admin(auth.uid())`. Ariyana is a coach, so this works as-is. No migration needed.

## Out of scope (mention but don't build unless you say go)

- **Cross-week history view** ("show me everyone reminded in the last 4 weeks") — useful for audit but not the immediate need.
- **Auto-reminder cron** — sending automatically without a human in the loop. Worth a separate conversation; current human-driven flow is intentional.
- **Per-recipient send confirmation in modal** — the modal already lists recipients; checkbox state from the card is enough.

## Files touched

- `src/pages/coach/RemindersTab.tsx` — add reminder_log query, sender name lookup, per-row checkboxes + status pills, header summary
- No DB migrations
- No edge function changes

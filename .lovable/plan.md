

## Collapsed Session Card: What to Show + Pill Reorder

### What details to surface on the collapsed card

Given the workflow stages and available data, here's what makes sense per status:

| Status | Currently shown | Add to collapsed row |
|---|---|---|
| `scheduled` (Draft) | Title + "Draft — build agenda" | Nothing extra — it's empty |
| `director_prep_ready` | Title + "Pending scheduling" | Number of focus areas selected (e.g. "2 focus areas selected") |
| `scheduling_invite_sent` | Title + "Pending scheduling" | Same as above + "Awaiting doctor's response" |
| `doctor_prep_submitted` | Title + "Pending scheduling" | "Doctor submitted prep" — count of doctor-selected focus areas |
| `meeting_pending` | Title + date | "Summary shared" — brief snippet or action step count (e.g. "2 action steps") |
| `doctor_confirmed` | Title + date | "Confirmed" + action step count |
| `doctor_revision_requested` | Title + date | "Doctor left a note" indicator |

**Implementation**: Fetch lightweight counts (selection count, experiment count) eagerly (not only when expanded) to populate the collapsed summary line. This is a small query per session — just counts, not full records.

### Specific changes

**1. Add a summary subtitle to each collapsed card**
- For `director_prep_ready` / `scheduling_invite_sent` / `doctor_prep_submitted`: fetch count of `coaching_session_selections` for this session, show "N focus areas selected"
- For `meeting_pending` / `doctor_confirmed`: fetch `coaching_meeting_records` to get experiment count, show "N action steps"
- For `doctor_revision_requested`: show "Doctor left a note" in the subtitle

**2. Move status pill left of action buttons**
Currently the order is: `[Action Buttons] [Badge] [Delete]`
Change to: `[Badge] [Action Buttons] [Delete]`

### Files to modify
- `src/components/clinical/DoctorDetailThread.tsx` — add summary queries (always enabled, not just when expanded), render subtitle, reorder badge/buttons


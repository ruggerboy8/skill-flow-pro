

# Baseline Reset + Inline Notes in Clinical View

Two changes: (1) delete Johno Oberly's baseline data so you can re-test, and (2) show doctor notes inline in the clinical results view instead of opening the materials drawer.

---

## 1. Delete Johno Oberly's Baseline Assessment

Staff ID: `98389f2a-7999-4daa-94dc-c5c67c6fbefc`
Assessment ID: `58a33268-ed86-467b-ae4f-16f08e29527c`

Run these deletes in order (items first due to FK cascade, then assessment):

```sql
DELETE FROM doctor_baseline_items WHERE assessment_id = '58a33268-ed86-467b-ae4f-16f08e29527c';
DELETE FROM doctor_baseline_assessments WHERE id = '58a33268-ed86-467b-ae4f-16f08e29527c';
```

Also check and delete any coach baseline assessment for this doctor:

```sql
DELETE FROM coach_baseline_items WHERE assessment_id IN (
  SELECT id FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc'
);
DELETE FROM coach_baseline_assessments WHERE doctor_staff_id = '98389f2a-7999-4daa-94dc-c5c67c6fbefc';
```

---

## 2. Inline Expandable Notes in Clinical Results View

**File:** `src/components/clinical/ClinicalBaselineResults.tsx`

Currently, clicking a pro move row opens `DoctorMaterialsSheet`. Change the behavior so that:

- Rows **without** a note remain clickable to open the materials sheet (or simply show no expandable section).
- Rows **with** a `self_note` get an expandable section directly underneath showing the note text. Clicking the row toggles the expansion instead of opening the drawer.
- The materials sheet is still accessible via a small "View details" link inside the expanded note section (or by clicking the pro move text itself).

### Implementation Details

- Add `expandedNoteId` state (`useState<number | null>(null)`).
- Change each row from a `<button>` that always calls `setSelectedItem` to:
  - If `item.self_note?.trim()`: toggle `expandedNoteId` to show/hide inline note. Add a small "View details" link inside the expanded area that opens the materials sheet.
  - If no note: keep existing behavior (open materials sheet on click).
- The expanded note section renders below the row as a `div` with `bg-muted/30 border-t px-4 py-3` containing the note text in `text-sm whitespace-pre-wrap`.
- The `MessageSquare` icon on noted rows remains as a visual indicator.

### Layout of Expanded Note

```
[Score Badge] [Pro Move Statement]           [You: 3] [MessageSquare icon]
  ┌─────────────────────────────────────────────────────────────────────┐
  │  "Doctor's note text here..."                                       │
  │                                                     View details >  │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/clinical/ClinicalBaselineResults.tsx` | Add `expandedNoteId` state, inline note expansion, conditional click behavior |
| Database (data delete) | Remove Johno Oberly baseline assessment + items |

